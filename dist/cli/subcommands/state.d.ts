/**
 * `dirgha state` — query the unified session state index.
 *
 * Lists recent sessions with their cross-referenced checkpoints and
 * cron jobs. Use `--session <id>` to dump full details for one entry.
 */
import type { Subcommand } from './index.js';
export declare const stateSubcommand: Subcommand;
