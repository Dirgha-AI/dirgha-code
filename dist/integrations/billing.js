/**
 * Billing client — quota preflight, usage recording, and per-session budget
 * enforcement for the agent loop.
 *
 * Three remote endpoints:
 *   POST /api/billing/preflight — quota check before an LLM call
 *   POST /api/billing/record    — post-request usage recording
 *   GET  /api/billing/account   — tier + balance + limits snapshot
 *
 * The local `BillingContext` accumulates per-session totals so the loop can
 * enforce an optional per-session budget without a round trip on every turn.
 */
import { IntegrationError, jsonRequest } from './http.js';
const DEFAULT_API_BASE = 'https://api.dirgha.ai';
function resolveApiBase(apiBase) {
    const raw = apiBase ?? process.env.DIRGHA_API_BASE ?? DEFAULT_API_BASE;
    return raw.replace(/\/+$/, '');
}
/**
 * Check remote quota before dispatching an LLM call. Returns allowed=false
 * plus a human-readable reason when the user is out of quota. Throws on
 * network / 5xx errors (the caller decides whether to fail open).
 */
export async function checkQuota(token, estimatedTokens, apiBase) {
    const response = await jsonRequest({
        baseUrl: resolveApiBase(apiBase),
        path: '/api/billing/preflight',
        method: 'POST',
        token,
        body: { estimated_tokens: estimatedTokens },
        timeoutMs: 5_000,
    });
    return {
        allowed: response.allowed !== false,
        reason: response.reason,
        remaining: typeof response.remaining === 'number' ? response.remaining : 0,
        resetAt: response.resetAt ?? response.reset_at ?? '',
    };
}
/**
 * Record post-request usage. The gateway is the source of truth for cost —
 * we trust its math rather than recomputing locally.
 */
export async function recordUsage(token, modelId, inputTokens, outputTokens, apiBase) {
    const response = await jsonRequest({
        baseUrl: resolveApiBase(apiBase),
        path: '/api/billing/record',
        method: 'POST',
        token,
        body: { model_id: modelId, input_tokens: inputTokens, output_tokens: outputTokens },
        timeoutMs: 5_000,
    });
    return {
        costUsd: response.costUsd ?? response.cost_usd ?? 0,
        newBalance: response.newBalance ?? response.new_balance ?? 0,
    };
}
/** Fetch tier + balance + limits. */
export async function getAccountStatus(token, apiBase) {
    return jsonRequest({
        baseUrl: resolveApiBase(apiBase),
        path: '/api/billing/account',
        method: 'GET',
        token,
        timeoutMs: 5_000,
    });
}
export function createBillingContext(sessionId, budgetCapUsd) {
    return { sessionId, tokensUsed: 0, costUsdTotal: 0, budgetCapUsd };
}
/**
 * Pre-request quota + budget gate. Local budget is checked first (no I/O);
 * remote preflight is optional and fails open when a token is absent or
 * the gateway is unreachable.
 */
export async function preRequestCheck(ctx, estTokens, opts = {}) {
    if (ctx.budgetCapUsd !== undefined && ctx.costUsdTotal >= ctx.budgetCapUsd) {
        return {
            allowed: false,
            reason: `Session budget cap reached: $${ctx.costUsdTotal.toFixed(4)} / $${ctx.budgetCapUsd.toFixed(4)}`,
        };
    }
    if (opts.remote !== false && opts.token) {
        try {
            const quota = await checkQuota(opts.token, estTokens, opts.apiBase);
            if (!quota.allowed) {
                return { allowed: false, reason: quota.reason ?? 'Quota exceeded' };
            }
        }
        catch (err) {
            // Offline-first: swallow network + auth errors, let the LLM call
            // surface the real failure if the gateway is truly down.
            if (err instanceof IntegrationError && err.status === 401) {
                return { allowed: false, reason: 'Auth expired — run `dirgha login`' };
            }
            // fall through — offline-first
        }
    }
    return { allowed: true };
}
/** Folds a recorded usage sample into a session context. */
export function applyUsage(ctx, inputTokens, outputTokens, costUsd) {
    ctx.tokensUsed += inputTokens + outputTokens;
    ctx.costUsdTotal += costUsd;
    return ctx;
}
//# sourceMappingURL=billing.js.map