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
import { clearToken, loadToken, migrateLegacyAuth, pollDeviceAuth, saveToken, startDeviceAuth, } from './device-auth.js';
function toAuthToken(tok) {
    return { jwt: tok.token, scope: [], expiresAt: tok.expiresAt, userId: tok.userId, email: tok.email };
}
/**
 * @deprecated Prefer the functional API in `./device-auth.js`
 *             (`startDeviceAuth`, `pollDeviceAuth`, `saveToken`,
 *             `loadToken`, `clearToken`). This helper exists only so
 *             legacy callers keep compiling.
 */
export function createAuthClient(opts = {}) {
    const openBrowser = opts.openBrowser ?? ((url) => { process.stdout.write(`Open in a browser to continue:\n${url}\n`); });
    const apiBase = opts.gatewayUrl;
    return {
        async currentToken() {
            await migrateLegacyAuth().catch(() => undefined);
            const tok = await loadToken();
            return tok ? toAuthToken(tok) : undefined;
        },
        async login() {
            await migrateLegacyAuth().catch(() => undefined);
            const start = await startDeviceAuth(apiBase);
            openBrowser(start.verifyUri);
            const result = await pollDeviceAuth(start.deviceCode, apiBase, {
                intervalMs: opts.pollIntervalMs ?? start.interval,
                timeoutMs: opts.pollTimeoutMs,
            });
            await saveToken(result.token, result.userId, result.email);
            const stored = await loadToken();
            if (!stored)
                throw new Error('login succeeded but token failed to persist');
            return toAuthToken(stored);
        },
        async logout() {
            await clearToken();
        },
    };
}
//# sourceMappingURL=auth.js.map