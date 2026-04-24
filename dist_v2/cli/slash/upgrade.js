/**
 * /upgrade — show current plan and the upgrade URL.
 *
 * Uses `getAccountStatus` to report the active tier, then prints the
 * upgrade link (configurable via `DIRGHA_UPGRADE_URL`). A referral code
 * is appended when the gateway returns one.
 */
import { getAccountStatus } from '../../integrations/billing.js';
import { loadToken } from '../../integrations/device-auth.js';
import { IntegrationError, jsonRequest } from '../../integrations/http.js';
async function fetchReferralCode(token, apiBase) {
    try {
        const res = await jsonRequest({
            baseUrl: apiBase,
            path: '/api/billing/account',
            token,
            timeoutMs: 5_000,
        });
        return res.referralCode ?? res.referral_code;
    }
    catch (err) {
        if (err instanceof IntegrationError)
            return undefined;
        return undefined;
    }
}
export const upgradeCommand = {
    name: 'upgrade',
    description: 'Show current plan and upgrade URL',
    async execute(_args, ctx) {
        const upgradeBase = ctx.upgradeUrl();
        let token = ctx.getToken();
        if (!token) {
            token = await loadToken();
            if (token)
                ctx.setToken(token);
        }
        if (!token) {
            return [
                'Not signed in. Sign in first with /login, then /upgrade.',
                '',
                `Upgrade: ${upgradeBase}`,
            ].join('\n');
        }
        try {
            const status = await getAccountStatus(token.token, ctx.apiBase());
            const referral = await fetchReferralCode(token.token, ctx.apiBase());
            const upgradeUrl = referral ? `${upgradeBase}?ref=${encodeURIComponent(referral)}` : upgradeBase;
            return [
                `Current plan: ${status.tier}`,
                `Balance: $${status.balanceUsd.toFixed(2)}`,
                '',
                `Upgrade: ${upgradeUrl}`,
                ...(referral ? [`Referral : ${referral}`] : []),
            ].join('\n');
        }
        catch (err) {
            return [
                `Could not fetch plan: ${err instanceof Error ? err.message : String(err)}`,
                '',
                `Upgrade: ${upgradeBase}`,
            ].join('\n');
        }
    },
};
//# sourceMappingURL=upgrade.js.map