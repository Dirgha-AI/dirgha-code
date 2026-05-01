/**
 * `dirgha login` — interactive sign-in.
 *
 * Two flows:
 *   - Default: device-code sign-in to the dirgha gateway.
 *   - `--provider=<name>`: BYOK flow that stores a per-provider API
 *     key in `~/.dirgha/keys.json` (mode 0600) so dirgha doesn't need
 *     a gateway account at all. The key is read first from
 *     `--key=<value>`, otherwise from a hidden stdin prompt.
 *
 * Non-REPL variant of the `/login` slash command. Returns POSIX exit codes.
 */
import type { Subcommand } from "./index.js";
export declare function runLogin(argv: string[]): Promise<number>;
export declare const loginSubcommand: Subcommand;
