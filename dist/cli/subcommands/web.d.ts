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
import type { Subcommand } from "./index.js";
export declare const webSubcommand: Subcommand;
