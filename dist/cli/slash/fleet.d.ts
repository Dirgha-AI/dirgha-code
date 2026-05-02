/**
 * /fleet — dispatch to fleet/cli-command for the read-only / quick
 * subcommands (list, help, discard, cleanup, merge). Long-running
 * launch + triple still belong in a separate shell because they spawn
 * 3+ subagents that would block the REPL for minutes; we point users
 * at the shell variant for those.
 */
import type { SlashCommand } from "./types.js";
export declare const fleetCommand: SlashCommand;
