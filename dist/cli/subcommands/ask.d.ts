/**
 * `dirgha ask "prompt"` — headless one-shot with tools.
 *
 * Semantically equivalent to passing a bare positional prompt to
 * `dirgha` on the command line (handled in main.ts), but spelled
 * explicitly so scripts can be self-documenting and unambiguous. We
 * default `--max-turns` to 30 (v1 parity) and forward everything else
 * through the main agent path.
 *
 * Implementation mirrors main.ts's non-interactive branch — we don't
 * delegate to it because that path lives inside a top-level async
 * `main()` with early exits, which makes it awkward to reuse as a
 * function. Keeping the one-shot pipeline here keeps the subcommand
 * composable and testable.
 */
import type { Subcommand } from './index.js';
export declare const askSubcommand: Subcommand;
