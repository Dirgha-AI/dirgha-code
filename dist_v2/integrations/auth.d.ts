/**
 * @deprecated Compatibility shim. Use `./device-auth.js` directly.
 *
 * Earlier revisions of the CLI shipped two parallel auth modules: this
 * file (storing `~/.dirgha/auth.json` behind `/api/auth/cli/*`) and
 * `device-auth.ts` (storing `~/.dirgha/credentials.json` behind
 * `/api/auth/device/*`). The device-code flow is the spec-aligned one
 * and is now the canonical implementation. This shim preserves the
 * historical `AuthClient` surface so a small number of in-tree callers
 * (`cli/auth-cmd.ts`, `cli/flows/full-cycle.ts`) keep compiling while
 * they migrate.
 *
 * On first use we silently migrate any pre-existing `auth.json` payload
 * into `credentials.json` (see `device-auth.migrateLegacyAuth`).
 */
/**
 * @deprecated Use `Token` from `./device-auth.js`. Retained for back-compat.
 */
export interface AuthToken {
    jwt: string;
    scope: string[];
    expiresAt: string;
    userId: string;
}
/** @deprecated Use the functional API in `./device-auth.js`. */
export interface AuthClient {
    currentToken(): Promise<AuthToken | undefined>;
    login(): Promise<AuthToken>;
    logout(): Promise<void>;
}
/** @deprecated Use `startDeviceAuth` / `pollDeviceAuth` arguments instead. */
export interface AuthClientOptions {
    gatewayUrl?: string;
    tokenPath?: string;
    pollIntervalMs?: number;
    pollTimeoutMs?: number;
    openBrowser?: (url: string) => void;
}
/**
 * @deprecated Prefer the functional API in `./device-auth.js`
 *             (`startDeviceAuth`, `pollDeviceAuth`, `saveToken`,
 *             `loadToken`, `clearToken`). This helper exists only so
 *             legacy callers keep compiling.
 */
export declare function createAuthClient(opts?: AuthClientOptions): AuthClient;
