/**
 * Device-code OAuth flow for the Dirgha gateway.
 *
 * Companion to `auth.ts` (which uses `~/.dirgha/auth.json` + the `/api/auth/cli/*`
 * routes). This module implements the legacy v1 token shape used by the rest
 * of the billing stack: `~/.dirgha/credentials.json` + `/api/auth/device/*`.
 *
 * The slash commands `login`, `account`, `upgrade` call this module. Keep the
 * public surface stable.
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
