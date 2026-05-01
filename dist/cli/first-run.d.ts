/**
 * First-run detection and welcome wizard.
 *
 * When no provider API keys are configured (no keys.json entries, no
 * env vars), shows a friendly wizard that guides new users through
 * their options. Designed to be the very first thing the CLI does on
 * a new install before anything else.
 */
export declare function checkFirstRun(): boolean;
export declare function showWelcomeWizard(): Promise<void>;
