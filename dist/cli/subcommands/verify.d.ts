/**
 * `dirgha verify` — run an agent task with a shell-command acceptance
 * gate. The agent runs the goal, then we exec the acceptance command:
 * exit 0 = pass, any non-zero = fail. Returns 0 only when both the
 * agent loop ends cleanly AND the acceptance gate passes.
 *
 * Usage:
 *   dirgha verify "<goal>" --accept "<shell command>"
 *                          [-m <model>] [--max-turns N]
 *                          [--retries N]
 *
 * Examples:
 *   dirgha verify "Add a sum() to math.py" \
 *     --accept "python -c 'from math import sum; assert sum([1,2])==3'"
 *
 *   dirgha verify "Wire CORS into the gateway" \
 *     --accept "curl -fs -H 'Origin: https://x' http://localhost:3000/api/health" \
 *     --retries 2
 */
import type { Subcommand } from './index.js';
export declare const verifySubcommand: Subcommand;
