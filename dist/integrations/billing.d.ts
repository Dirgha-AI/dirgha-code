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
export interface QuotaCheck {
    allowed: boolean;
    reason?: string;
    remaining: number;
    resetAt: string;
}
export interface UsageRecord {
    costUsd: number;
    newBalance: number;
}
export interface AccountStatus {
    userId: string;
    email: string;
    tier: 'free' | 'pro' | 'team' | 'enterprise';
    balanceUsd: number;
    limits: {
        dailyTokens: number;
        monthlyTokens: number;
        dailyTokensUsed: number;
        monthlyTokensUsed: number;
    };
    resetAt: string;
}
export interface BillingContext {
    sessionId: string;
    tokensUsed: number;
    costUsdTotal: number;
    budgetCapUsd?: number;
}
export interface PreflightResult {
    allowed: boolean;
    reason?: string;
}
/**
 * Check remote quota before dispatching an LLM call. Returns allowed=false
 * plus a human-readable reason when the user is out of quota. Throws on
 * network / 5xx errors (the caller decides whether to fail open).
 */
export declare function checkQuota(token: string, estimatedTokens: number, apiBase?: string): Promise<QuotaCheck>;
/**
 * Record post-request usage. The gateway is the source of truth for cost —
 * we trust its math rather than recomputing locally.
 */
export declare function recordUsage(token: string, modelId: string, inputTokens: number, outputTokens: number, apiBase?: string): Promise<UsageRecord>;
/** Fetch tier + balance + limits. */
export declare function getAccountStatus(token: string, apiBase?: string): Promise<AccountStatus>;
export declare function createBillingContext(sessionId: string, budgetCapUsd?: number): BillingContext;
/**
 * Pre-request quota + budget gate. Local budget is checked first (no I/O);
 * remote preflight is optional and fails open when a token is absent or
 * the gateway is unreachable.
 */
export declare function preRequestCheck(ctx: BillingContext, estTokens: number, opts?: {
    token?: string;
    apiBase?: string;
    remote?: boolean;
}): Promise<PreflightResult>;
/** Folds a recorded usage sample into a session context. */
export declare function applyUsage(ctx: BillingContext, inputTokens: number, outputTokens: number, costUsd: number): BillingContext;
