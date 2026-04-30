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

import {
  clearToken,
  loadToken,
  migrateLegacyAuth,
  pollDeviceAuth,
  saveToken,
  startDeviceAuth,
  type Token,
} from './device-auth.js';

/**
 * @deprecated Use `Token` from `./device-auth.js`. Retained for back-compat.
 */
export interface AuthToken {
  jwt: string;
  scope: string[];
  expiresAt: string;
  userId: string;
  /** Email of the authenticated user. Empty string when unknown. */
  email: string;
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

function toAuthToken(tok: Token): AuthToken {
  return { jwt: tok.token, scope: [], expiresAt: tok.expiresAt, userId: tok.userId, email: tok.email };
}

/**
 * @deprecated Prefer the functional API in `./device-auth.js`
 *             (`startDeviceAuth`, `pollDeviceAuth`, `saveToken`,
 *             `loadToken`, `clearToken`). This helper exists only so
 *             legacy callers keep compiling.
 */
export function createAuthClient(opts: AuthClientOptions = {}): AuthClient {
  const openBrowser = opts.openBrowser ?? ((url: string) => { process.stdout.write(`Open in a browser to continue:\n${url}\n`); });
  const apiBase = opts.gatewayUrl;

  return {
    async currentToken(): Promise<AuthToken | undefined> {
      await migrateLegacyAuth().catch(() => undefined);
      const tok = await loadToken();
      return tok ? toAuthToken(tok) : undefined;
    },
    async login(): Promise<AuthToken> {
      await migrateLegacyAuth().catch(() => undefined);
      const start = await startDeviceAuth(apiBase);
      openBrowser(start.verifyUri);
      const result = await pollDeviceAuth(start.deviceCode, apiBase, {
        intervalMs: opts.pollIntervalMs ?? start.interval,
        timeoutMs: opts.pollTimeoutMs,
      });
      await saveToken(result.token, result.userId, result.email);
      const stored = await loadToken();
      if (!stored) throw new Error('login succeeded but token failed to persist');
      return toAuthToken(stored);
    },
    async logout(): Promise<void> {
      await clearToken();
    },
  };
}
