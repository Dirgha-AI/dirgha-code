/**
 * `dirgha setup` — three-step provider/auth/model wizard.
 *
 * Thin shim that delegates to the canonical implementation in
 * `cli/flows/wizard.ts`. Kept here so other modules that import
 * `setupSubcommand` or `runSetup` from `./setup.js` continue to work.
 */

import { runWizard } from '../flows/wizard.js';
import type { Subcommand } from './index.js';

export async function runSetup(argv: string[]): Promise<number> {
  return runWizard(argv);
}

export const setupSubcommand: Subcommand = {
  name: 'setup',
  description: 'Three-step provider · auth · model wizard',
  async run(argv) { return runWizard(argv); },
};
