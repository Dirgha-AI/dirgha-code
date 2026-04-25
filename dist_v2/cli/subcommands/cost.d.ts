/**
 * `dirgha cost` — read the audit log and report cumulative token usage
 * + USD spend, grouped by day and model. The audit log already records
 * a `turn-end` entry per turn with `model` and `usage`; we just need to
 * fold them through `findPrice` to surface dollars.
 *
 * Subcommands (all read-only):
 *   today            Today's totals (default)
 *   day <YYYY-MM-DD> Totals for a specific date
 *   week             Last 7 days
 *   all              Everything in the audit log
 *   --json           Machine-readable output
 */
import type { Subcommand } from './index.js';
export declare const costSubcommand: Subcommand;
