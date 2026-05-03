/**
 * `dirgha doctor` — environment diagnostics.
 *
 * Checks Node version (≥ 20), that cwd is a git repo, that `~/.dirgha/`
 * exists and is writable, which provider env vars are set, and whether
 * each configured provider's base endpoint is reachable (HEAD/GET with a
 * 3 s timeout). Prints a table by default; emits NDJSON when `--json`
 * is passed. Exit code 0 when every check passes, 1 if any fails.
 */
import type { Subcommand } from "./index.js";
export declare const doctorSubcommand: Subcommand;
