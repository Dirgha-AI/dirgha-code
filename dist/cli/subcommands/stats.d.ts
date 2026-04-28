/**
 * `dirgha stats` — session + token + cost aggregates.
 *
 * Reads the JSONL session files under `~/.dirgha/sessions/`, walking
 * every `usage` entry to compute totals. Subcommands narrow the time
 * window (today / week / month / all; defaults to `all`). Output is a
 * table by default, `--json` for structured output.
 *
 * By-model and by-day rollups are also emitted so the user can see
 * which model ate the budget and how usage trends over time.
 */
import type { Subcommand } from './index.js';
export declare const statsSubcommand: Subcommand;
