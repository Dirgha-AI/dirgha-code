/**
 * Device-code authentication flow for the gateway-issued JWT. The token
 * is stored at `~/.dirgha/auth.json` with 0600 permissions and cached
 * in memory for the lifetime of the process.
 */
export interface AuthToken {
    jwt: string;
    scope: string[];
    expiresAt: string;
    userId: string;
}
export interface AuthClient {
    currentToken(): Promise<AuthToken | undefined>;
    login(): Promise<AuthToken>;
    logout(): Promise<void>;
}
export interface AuthClientOptions {
    gatewayUrl?: string;
    tokenPath?: string;
    pollIntervalMs?: number;
    pollTimeoutMs?: number;
    openBrowser?: (url: string) => void;
}
export declare function createAuthClient(opts?: AuthClientOptions): AuthClient;
