/**
 * Remote configuration fetched from the Dirgha gateway on startup.
 * Cached to ~/.dirgha/remote-config.json, refreshed every 24 hours.
 *
 * Sets:
 *   - Model picker default to recommendedModel if no explicit model set
 *   - Upgrade banner if current version < minimumVersion
 *   - MOTD shown once per session
 *   - Warnings for deprecated models
 */
export interface RemoteConfig {
    recommendedModel: string;
    recommendedFreeModel: string;
    minimumVersion: string;
    deprecatedModels: string[];
    providerDefaults: Record<string, string>;
    motd?: string;
}
export declare function fetchRemoteConfig(): Promise<RemoteConfig | null>;
export declare function getCachedConfig(): Promise<RemoteConfig | null>;
/**
 * One-stop fetch: returns cached if fresh, otherwise fetches from
 * the gateway. Returns null if neither is available.
 */
export declare function getRemoteConfig(): Promise<RemoteConfig | null>;
export declare function isVersionBelowMin(current: string, minimum: string): boolean;
