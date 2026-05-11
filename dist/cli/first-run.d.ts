/**
 * First-run detection and interactive key setup.
 *
 * If no API key is found, shows an interactive wizard that lets the user
 * paste a key immediately (no restart needed). After saving, launches the
 * TUI with a reliable default model for the detected provider.
 *
 * Also detects: OpenRouter, NVIDIA, DeepSeek, and other provider env vars.
 */
export declare function checkFirstRun(): boolean;
export declare function showWelcomeWizard(): Promise<void>;
