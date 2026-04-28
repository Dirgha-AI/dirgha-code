/**
 * Pure functions for cost aggregation and HTML rendering for the cost dashboard.
 * These are testable and used by web/server.ts.
 */
export interface CostAuditEntry {
    ts: string;
    kind?: string;
    model?: string;
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
        cachedTokens?: number;
    };
}
export interface ModelTotal {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    costUsd: number;
    turns: number;
}
export interface CostSummary {
    totals: ModelTotal[];
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCachedTokens: number;
    totalTurns: number;
    modelCount: number;
    windowFromTs?: string;
    windowToTs?: string;
}
export declare function aggregateCost(entries: CostAuditEntry[]): CostSummary;
export declare function renderCostPage(summary: CostSummary): string;
