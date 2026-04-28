/**
 * `dirgha init [path]` — scaffold DIRGHA.md in `path` (default: cwd).
 *
 * Refuses to overwrite an existing DIRGHA.md unless `--force` is
 * passed, in which case it replaces the file and prints the old first
 * line as a reference. Mirrors the REPL `/init` slash but lets the
 * user target a subdirectory directly from the shell.
 */
import type { Subcommand } from './index.js';
export declare const initSubcommand: Subcommand;
