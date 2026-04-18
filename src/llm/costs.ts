/**
 * llm/costs.ts — Cost tracking per query
 */
export interface CostRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: string;
  query: string;
}

const costs: CostRecord[] = [];

export function trackCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  query: string,
  modelCosts: Record<string, number> = {}
): CostRecord {
  const costPer1K = modelCosts[model] || 3; // Default sonnet rate
  const costUsd = ((inputTokens + outputTokens) / 1000) * costPer1K;
  
  const record: CostRecord = {
    model,
    inputTokens,
    outputTokens,
    costUsd,
    timestamp: new Date().toISOString(),
    query: query.slice(0, 100)
  };
  
  costs.push(record);
  return record;
}

export function getTotalCost(since?: string): number {
  const sinceDate = since ? new Date(since) : null;
  return costs
    .filter(c => !sinceDate || new Date(c.timestamp) >= sinceDate)
    .reduce((sum, c) => sum + c.costUsd, 0);
}

export function getCostStats(): { total: number; count: number; avg: number } {
  const total = costs.reduce((sum, c) => sum + c.costUsd, 0);
  return {
    total: Math.round(total * 1000) / 1000,
    count: costs.length,
    avg: costs.length ? Math.round((total / costs.length) * 1000) / 1000 : 0
  };
}
