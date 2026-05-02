/**
 * BYOK key store. The `dirgha keys` subcommand writes provider API keys
 * to `~/.dirgha/keys.json` (mode 0600). Without this loader, those keys
 * never reach the provider classes — every provider reads
 * `process.env.<NAME>_API_KEY`, so we hydrate the env on startup.
 *
 * Real env vars take precedence over the file — letting users override
 * a stored key for one invocation by exporting in the shell.
 */
/// <reference types="node" resolution-mode="require"/>
export interface KeyStore {
    [envVar: string]: string;
}
export declare function keyStorePath(): string;
export declare function readKeyStore(path?: string): Promise<KeyStore>;
/**
 * Read `~/.dirgha/keys.json` and copy each entry into `process.env` if
 * (and only if) the env var is not already set. Returns the list of
 * names that were hydrated (useful for `--verbose` startup logs).
 */
export declare function hydrateEnvFromKeyStore(env?: NodeJS.ProcessEnv, path?: string): Promise<string[]>;
/** Persist a single key to ~/.dirgha/keys.json and hydrate process.env immediately. */
export declare function saveKey(envVar: string, value: string, path?: string): Promise<void>;
