/**
 * Device-code OAuth flow for the Dirgha gateway.
 *
 * Canonical auth module. Stores tokens at `~/.dirgha/credentials.json`
 * (0600) and drives the `/api/auth/device/*` endpoints. The older
 * `integrations/auth.ts` is now a compatibility shim that delegates
 * here so the billing + entitlements stack has exactly one source of
 * truth for the active token.
 *
 * Callers:
 *   - Slash commands (`/login`, `/account`, `/upgrade`) via `loadToken()`.
 *   - CLI subcommands (`dirgha login`, `dirgha logout`).
 *   - Billing preflight (`preRequestCheck` reads the bearer).
 */
export interface DeviceAuthStart {
    userCode: string;
    verifyUri: string;
    deviceCode: string;
    interval: number;
    expiresIn: number;
}
export interface DeviceAuthResult {
    token: string;
    userId: string;
    email: string;
}
export interface Token {
    token: string;
    userId: string;
    email: string;
    expiresAt: string;
}
export declare function startDeviceAuth(apiBase?: string): Promise<DeviceAuthStart>;
export declare function pollDeviceAuth(deviceCode: string, apiBase?: string, opts?: {
    intervalMs?: number;
    timeoutMs?: number;
}): Promise<DeviceAuthResult>;
export declare function saveToken(token: string, userId: string, email: string): Promise<void>;
export declare function loadToken(): Promise<Token | null>;
export declare function clearToken(): Promise<void>;
/**
 * One-shot migration from the legacy `~/.dirgha/auth.json` format
 * (`integrations/auth.ts`) to the canonical `credentials.json`. Safe to
 * call on every CLI start — returns `false` fast when nothing to do.
 *
 * Logs a single line to stderr on a successful move. Silent on no-op.
 */
export declare function migrateLegacyAuth(): Promise<boolean>;
