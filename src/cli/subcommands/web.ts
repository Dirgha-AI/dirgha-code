/**
 * `dirgha web` — boot the read-only localhost dashboard for audit /
 * cost / ledger. Three pages, no auth, never binds 0.0.0.0.
 *
 * Usage:
 *   dirgha web                Open at http://127.0.0.1:7878
 *   dirgha web --port=9000    Custom port
 *   dirgha web --json         Print URL as JSON, then keep serving
 *
 * Stops on Ctrl+C (closes the http server cleanly before exit).
 */

import { stdout, stderr } from "node:process";
import { startWebServer } from "../../web/server.js";
import { style, defaultTheme } from "../../tui/theme.js";
import type { Subcommand } from "./index.js";

// scope: S19d

function parsePort(argv: string[]): number | undefined {
  for (const a of argv) {
    if (a.startsWith("--port=")) {
      const n = Number(a.slice("--port=".length));
      if (Number.isFinite(n) && n >= 0 && n < 65536) return n;
    }
  }
  return undefined;
}

export const webSubcommand: Subcommand = {
  name: "web",
  description: "Read-only localhost dashboard (audit / cost / ledger)",
  async run(argv): Promise<number> {
    const json = argv.includes("--json");
    const port = parsePort(argv);

    let srv: Awaited<ReturnType<typeof startWebServer>>;
    try {
      srv = await startWebServer(port !== undefined ? { port } : {});
    } catch (err) {
      stderr.write(
        `failed to start dashboard: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 1;
    }

    if (json) {
      stdout.write(
        JSON.stringify({ url: srv.url, pages: ["/", "/cost", "/ledger"] }) +
          "\n",
      );
    } else {
      stdout.write(
        `${style(defaultTheme.success, "✓")} Dirgha Web Dashboard at ${style(defaultTheme.accent, srv.url)}\n`,
      );
      stdout.write(
        `  Pages: ${srv.url}/  ·  ${srv.url}/cost  ·  ${srv.url}/ledger\n`,
      );
      stdout.write(`  Press Ctrl+C to stop.\n`);
    }

    return new Promise<number>((resolve) => {
      const stop = async (): Promise<void> => {
        try {
          await srv.close();
        } catch {
          /* swallow shutdown errors */
        }
        resolve(0);
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  },
};
