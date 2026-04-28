/**
 * /account — billing + entitlements snapshot.
 *
 * Requires an active token (loaded from `credentials.json` at REPL
 * start). Calls `/api/billing/account` for tier + balance + limits and
 * `/api/billing/entitlements` (via `checkEntitlement`) to show whether
 * Fleet is unlocked.
 */
import { getAccountStatus } from '../../integrations/billing.js';
import { checkEntitlement } from '../../integrations/entitlements.js';
import { loadToken } from '../../integrations/device-auth.js';
function fmtUsd(n) {
    return `$${n.toFixed(2)}`;
}
function fmtTokens(used, limit) {
    if (!limit)
        return `${used.toLocaleString()}`;
    return `${used.toLocaleString()} / ${limit.toLocaleString()}`;
}
function render(status, fleet) {
    return [
        'Account:',
        `  user      : ${status.email} (${status.userId})`,
        `  tier      : ${status.tier}`,
        `  balance   : ${fmtUsd(status.balanceUsd)}`,
        `  daily     : ${fmtTokens(status.limits.dailyTokensUsed, status.limits.dailyTokens)} tokens`,
        `  monthly   : ${fmtTokens(status.limits.monthlyTokensUsed, status.limits.monthlyTokens)} tokens`,
        `  resets at : ${status.resetAt || 'unknown'}`,
        '',
        `  Fleet access: ${fleet ? '✓' : '✗'}`,
    ].join('\n');
}
export const accountCommand = {
    name: 'account',
    description: 'Show billing tier, balance, and limits',
    async execute(_args, ctx) {
        // Fall back to re-reading in case another REPL shell signed in.
        let token = ctx.getToken();
        if (!token) {
            token = await loadToken();
            if (token)
                ctx.setToken(token);
        }
        if (!token) {
            return 'Not signed in. Run /login first.';
        }
        try {
            const [status, fleet] = await Promise.all([
                getAccountStatus(token.token, ctx.apiBase()),
                checkEntitlement(token.token, 'fleet', { baseUrl: ctx.apiBase() }),
            ]);
            return render(status, fleet);
        }
        catch (err) {
            return `Account lookup failed: ${err instanceof Error ? err.message : String(err)}`;
        }
    },
};
//# sourceMappingURL=account.js.map