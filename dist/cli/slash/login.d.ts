/**
 * /login — device-code flow inside the REPL.
 *
 * Kicks off `/api/auth/device/request`, shows the user code + verification
 * URL, then polls in the background so the REPL stays interactive. On
 * success, saves the token and swaps it into `SlashContext` so
 * subsequent billing / entitlement calls pick it up immediately.
 */
import type { SlashCommand } from "./types.js";
export declare const loginCommand: SlashCommand;
