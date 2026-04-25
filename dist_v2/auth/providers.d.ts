/**
 * Provider registry — single source of truth for BYOK metadata.
 *
 * Each entry maps a CLI-friendly provider id (used in
 * `dirgha login --provider=<id>`) to:
 *
 *   - displayName: friendly label for `keys list` / `auth list`
 *   - envVars:     env names checked in priority order. The first
 *                  entry is the "canonical" one used by `keys set`
 *                  and `login --provider=…`. Extra entries match
 *                  the multi-env-name convention so a key set for
 *                  `GH_TOKEN` is also visible to `GITHUB_TOKEN`.
 *   - baseUrl:     default API base. Override env name in
 *                  `baseUrlEnv` for self-hosted endpoints.
 *   - homepage:    where to mint a key
 *   - authType:    'api_key' | 'oauth_external' | 'gateway'
 *
 * 16 providers covered today; adding a new one is a one-record diff.
 * Shape is intentionally compatible with the `models.dev` provider
 * record format so downstream tooling can interop.
 */
export interface ProviderInfo {
    id: string;
    displayName: string;
    envVars: readonly string[];
    baseUrl?: string;
    baseUrlEnv?: string;
    homepage: string;
    authType: 'api_key' | 'oauth_external' | 'gateway';
}
export declare const PROVIDERS: readonly ProviderInfo[];
export declare function findProviderById(id: string): ProviderInfo | undefined;
export declare function findProviderByEnv(envName: string): ProviderInfo | undefined;
export declare function listProviders(): readonly ProviderInfo[];
export declare function listEnvVars(): readonly string[];
