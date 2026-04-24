/**
 * Cost tracker. Accumulates token usage by session and translates it to
 * USD via the price catalogue. Supports per-session budgets that
 * report when the budget is close or exceeded; enforcement is the
 * caller's responsibility (typically the agent loop).
 */
import type { UsageTotal } from '../kernel/types.js';
export interface CostRecord {
    sessionId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    costUsd: number;
    ts: string;
}
export interface CostTracker {
    record(provider: string, model: string, usage: UsageTotal, sessionId: string): CostRecord;
    sessionTotal(sessionId: string): UsageTotal;
    dailyTotal(date?: string): UsageTotal;
    budget(sessionId: string, budgetUsd: number): {
        withinBudget: boolean;
        used: number;
        remaining: number;
    };
}
export declare function createCostTracker(): CostTracker;
