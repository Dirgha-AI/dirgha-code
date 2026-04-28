/**
 * `dirgha keys <list|set|get|clear>` — BYOK key store at
 * `~/.dirgha/keys.json` (mode 0600).
 *
 * Mirrors the `/keys` slash but is callable non-interactively from
 * shells and scripts. `list` masks values; `get` prints the raw value
 * (supported but noisy by design so nobody leans on it). `set` writes
 * the file with a 0600 chmod. `clear` removes one key or everything
 * when given `all`.
 */
import type { Subcommand } from './index.js';
export declare const keysSubcommand: Subcommand;
