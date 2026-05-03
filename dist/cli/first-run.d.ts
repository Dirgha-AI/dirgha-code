/**
 * First-run detection and interactive key setup.
 *
 * If no API key is found, shows an interactive wizard that lets the user
 * paste a key immediately (no restart needed). After saving, launches the
 * TUI with a recommended free model so the first chat works in < 30 seconds.
 *
 * Also detects: OpenRouter free tokens, NVIDIA free tier, environment vars.
 */
export declare function checkFirstRun(): boolean;
export declare function showWelcomeWizard(): Promise<void>;
