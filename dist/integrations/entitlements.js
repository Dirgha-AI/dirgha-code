/**
 * Entitlements check. Pulls the user's tier + feature flags from the
 * gateway. When a gated feature is requested, the caller invokes
 * requireFeature() which throws a clean error that the CLI turns into
 * an upgrade prompt.
 */
import { jsonRequest } from './http.js';
/**
 * Low-level feature check: returns true/false without throwing. Used by
 * slash commands that want to show/hide capability (e.g. `/fleet`,
 * `/tripleshot`) rather than hard-block.
 */
export async function checkEntitlement(token, feature, opts = {}) {
    const baseUrl = opts.baseUrl ?? process.env.DIRGHA_API_BASE ?? process.env.DIRGHA_GATEWAY_URL ?? 'https://api.dirgha.ai';
    try {
        const entitlements = await jsonRequest({
            baseUrl,
            path: '/api/billing/entitlements',
            token,
            timeoutMs: 5_000,
        });
        return entitlements.features[feature] === true;
    }
    catch {
        return false;
    }
}
export function createEntitlementsClient(opts = {}) {
    const baseUrl = opts.baseUrl ?? process.env.DIRGHA_GATEWAY_URL ?? 'https://api.dirgha.ai';
    const upgradeUrl = opts.upgradeUrl ?? 'https://dirgha.ai/upgrade';
    return {
        async get(token) {
            return jsonRequest({ baseUrl, path: '/api/billing/entitlements', token });
        },
        async requireFeature(token, feature) {
            const entitlements = await this.get(token);
            if (!entitlements.features[feature]) {
                throw new Error(`Feature "${feature}" requires an upgrade. Visit ${upgradeUrl} to unlock it on tier: ${entitlements.tier}.`);
            }
        },
    };
}
//# sourceMappingURL=entitlements.js.map