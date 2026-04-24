/**
 * `dirgha login` — interactive device-code sign-in.
 *
 * Non-REPL variant of the `/login` slash command. Prints the user code
 * and verification URL to stdout, waits for the poll to complete, then
 * persists the token via `saveToken`. Returns POSIX exit codes.
 */
import type { Subcommand } from './index.js';
export declare function runLogin(argv: string[]): Promise<number>;
export declare const loginSubcommand: Subcommand;
