/**
 * `dirgha setup` — three-step provider/auth/model wizard.
 *
 * Thin shim that delegates to the canonical implementation in
 * `cli/flows/wizard.ts`. Kept here so other modules that import
 * `setupSubcommand` or `runSetup` from `./setup.js` continue to work.
 */
import { runWizard } from '../flows/wizard.js';
export async function runSetup(argv) {
    return runWizard(argv);
}
export const setupSubcommand = {
    name: 'setup',
    description: 'Three-step provider · auth · model wizard',
    async run(argv) { return runWizard(argv); },
};
//# sourceMappingURL=setup.js.map