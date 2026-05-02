/**
 * `dirgha setup` — three-step provider/auth/model wizard.
 *
 * Thin shim that delegates to the canonical implementation in
 * `cli/flows/wizard.ts`. Kept here so other modules that import
 * `setupSubcommand` or `runSetup` from `./setup.js` continue to work.
 *
 * Flag:
 *   --features    Install optional native features (better-sqlite3, qmd)
 *                 instead of running the provider wizard.
 */
import { runWizard } from '../flows/wizard.js';
export async function runSetup(argv) {
    if (argv.includes('--features')) {
        const { runFeatureSetup } = await import('./feature-setup.js');
        return runFeatureSetup();
    }
    return runWizard(argv);
}
export const setupSubcommand = {
    name: 'setup',
    description: 'Three-step provider · auth · model wizard',
    async run(argv) { return runSetup(argv); },
};
//# sourceMappingURL=setup.js.map