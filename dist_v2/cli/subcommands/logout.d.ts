/**
 * `dirgha logout` — clear the cached credentials.
 *
 * Calls `clearToken()` (unlinks `~/.dirgha/credentials.json`) and
 * prints a single confirmation line. Always exits 0, even when no
 * token exists — idempotent sign-out matches curl/gh conventions.
 */
import type { Subcommand } from './index.js';
export declare function runLogout(_argv: string[]): Promise<number>;
export declare const logoutSubcommand: Subcommand;
