/**
 * `dirgha setup` — quick BYOK onboarding.
 *
 * Non-interactive sibling of `cli/setup.ts`. Asks for a preferred
 * provider and optional API keys, then persists them to
 * `~/.dirgha/keys.json` (mode 0600). Falls back to a how-to doc when
 * stdin is not a TTY or `--interactive=false` is passed.
 */
import type { Subcommand } from './index.js';
export declare function runSetup(argv: string[]): Promise<number>;
export declare const setupSubcommand: Subcommand;
