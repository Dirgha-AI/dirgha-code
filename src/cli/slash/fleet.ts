/**
 * /fleet — dispatch to fleet/cli-command for the read-only / quick
 * subcommands (list, help, discard, cleanup, merge). Long-running
 * launch + triple still belong in a separate shell because they spawn
 * 3+ subagents that would block the REPL for minutes; we point users
 * at the shell variant for those.
 */

import type { SlashCommand } from "./types.js";

const QUICK_SUBCOMMANDS = new Set([
  "list",
  "help",
  "--help",
  "-h",
  "discard",
  "cleanup",
  "merge",
]);

export const fleetCommand: SlashCommand = {
  name: "fleet",
  description:
    "Parallel agents in git worktrees (`/fleet list`, `/fleet help` here; `dirgha fleet launch` in a shell)",
  async execute(args) {
    const sub = args[0] ?? "help";
    const tail = args.length > 0 ? ` ${args.join(" ")}` : "";

    if (!QUICK_SUBCOMMANDS.has(sub)) {
      return [
        `\`/fleet ${sub}\` blocks the REPL while subagents stream — run from a shell instead:`,
        "",
        `  dirgha fleet${tail}`,
        "",
        "Quick subcommands you can run here: /fleet list · /fleet help · /fleet discard <branch> · /fleet cleanup · /fleet merge <branch>.",
      ].join("\n");
    }

    // Capture fleetCommand's stdout/stderr so we return it as the slash
    // response. The monkey-patch is scoped to a single synchronous import
    // + async execution — no other REPL path writes during this window.
    const { fleetCommand: runFleet } =
      await import("../../fleet/cli-command.js");

    // Extract --template <name> / --template=<name> from args so it can be
    // forwarded as a typed option. The flag is still left in args so that
    // doLaunch()'s own parser can handle it consistently.
    let templateName: string | undefined;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "--template" && i + 1 < args.length) {
        templateName = args[i + 1];
        break;
      }
      if (a.startsWith("--template=")) {
        templateName = a.slice("--template=".length);
        break;
      }
    }

    const captured: string[] = [];
    const sink = (chunk: string | Uint8Array): boolean => {
      captured.push(
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
      );
      return true;
    };
    const origOut = process.stdout.write;
    const origErr = process.stderr.write;
    process.stdout.write = sink as typeof process.stdout.write;
    process.stderr.write = sink as typeof process.stderr.write;
    try {
      const code = await runFleet(args, {
        cwd: process.cwd(),
        template: templateName,
      });
      const text = captured.join("").trim();
      if (code === 0) return text || "(fleet ok)";
      return `${text}\n(fleet exit=${code})`;
    } finally {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    }
  },
};
