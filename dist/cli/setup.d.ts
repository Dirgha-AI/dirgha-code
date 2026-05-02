/**
 * First-run interactive setup wizard.
 *
 * Prompts the user for provider API keys (BYOK), picks a default
 * model, and persists the result to `~/.dirgha/config.json` plus a
 * sibling `~/.dirgha/env` file that exports the keys for future
 * invocations. The wizard never overwrites an existing non-empty value
 * without confirmation.
 */
interface ProviderEntry {
    label: string;
    env: string;
    helpUrl: string;
    suggested: string[];
}
export declare const PROVIDERS: ProviderEntry[];
export interface SetupOptions {
    home?: string;
}
export declare function runSetup(opts?: SetupOptions): Promise<void>;
export {};
