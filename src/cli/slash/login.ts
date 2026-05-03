/**
 * /login — device-code flow inside the REPL.
 *
 * Kicks off `/api/auth/device/request`, shows the user code + verification
 * URL, then polls in the background so the REPL stays interactive. On
 * success, saves the token and swaps it into `SlashContext` so
 * subsequent billing / entitlement calls pick it up immediately.
 */

import {
  loadToken,
  pollDeviceAuth,
  saveToken,
  startDeviceAuth,
  type DeviceAuthStart,
} from "../../integrations/device-auth.js";
import type { SlashCommand } from "./types.js";

export const loginCommand: SlashCommand = {
  name: "login",
  description: "Sign in via device-code flow",
  async execute(_args, ctx) {
    let start: DeviceAuthStart;
    try {
      start = await startDeviceAuth(ctx.apiBase());
    } catch (err) {
      return `Login failed to start: ${err instanceof Error ? err.message : String(err)}`;
    }

    // Fire-and-forget the poll so the REPL prompt returns immediately.
    void (async () => {
      try {
        const result = await pollDeviceAuth(start.deviceCode, ctx.apiBase(), {
          intervalMs: start.interval,
          timeoutMs: start.expiresIn,
        });
        await saveToken(result.token, result.userId, result.email);
        const persisted = await loadToken();
        ctx.setToken(persisted);
        ctx.status(`[auth] signed in as ${result.email}`);
      } catch (err) {
        ctx.status(
          `[auth] login failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();

    return [
      "Device-code login started.",
      "",
      `  1. Open: ${start.verifyUri}`,
      `  2. Enter code: ${start.userCode}`,
      "",
      start.verifyUri.includes("?code=")
        ? "The code should be pre-filled on the page."
        : "",
      `No account? Sign up at: ${start.verifyUri.replace(/\/device.*$/, "/signup")}`,
      "",
      `Expires in ~${Math.round(start.expiresIn / 60_000)} minutes. The REPL stays usable; a status line will appear when authorization completes.`,
    ]
      .filter(Boolean)
      .join("\n");
  },
};
