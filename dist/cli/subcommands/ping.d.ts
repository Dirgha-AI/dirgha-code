/**
 * `dirgha ping` — measure round-trip latency to the current model provider.
 *
 * Sends a minimal chat completion ("Say 'ok'") and reports how long the
 * first response token and the full response took.
 */
import type { Subcommand } from './index.js';
export declare const pingSubcommand: Subcommand;
