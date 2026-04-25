/**
 * `dirgha setup` — three-step provider/auth/model wizard.
 *
 * Thin shim that delegates to the canonical implementation in
 * `cli/flows/wizard.ts`. Kept here so other modules that import
 * `setupSubcommand` or `runSetup` from `./setup.js` continue to work.
 */
import type { Subcommand } from './index.js';
export declare function runSetup(argv: string[]): Promise<number>;
export declare const setupSubcommand: Subcommand;
