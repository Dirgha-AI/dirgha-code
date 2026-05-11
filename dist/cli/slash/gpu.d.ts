/**
 * /gpu — manage GPU compute: list types, check budget, view jobs
 *
 * Subcommands:
 *   list              — list available GPU types + pricing
 *   budget [amount]   — show or set monthly GPU budget (0 = unlimited)
 *   jobs              — list running/completed GPU jobs
 *   audit             — show recent GPU audit log entries
 */
import type { SlashCommand } from "./types.js";
export declare const gpuSlashCommand: SlashCommand;
