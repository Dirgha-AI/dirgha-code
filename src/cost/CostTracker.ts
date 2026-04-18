/**
 * cost/CostTracker.ts — Per-call cost tracking with rolling analytics
 * Tracks every API call with tier, latency, and token usage
 */

export interface CostRecord {
  id: string;
  timestamp: number;
  tier: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs: number;
  taskType: string;
  success: boolean;
}

export interface CostSummary {
  totalCalls: number;
  totalCost: number;
  avgCostPerCall: number;
  avgLatencyMs: number;
  byTier: Record<string, { calls: number; cost: number }>;
  byHour: Record<number, number>;
}

export class CostTracker {
  private records: CostRecord[] = [];
  private maxRecords = 10000; // Rolling window

  track(record: Omit<CostRecord, 'id' | 'timestamp'>): CostRecord {
    const fullRecord: CostRecord = {
      ...record,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };

    this.records.push(fullRecord);

    // Prune old records
    if (this.records.length > this.maxRecords) {
      this.records.shift();
    }

    return fullRecord;
  }

  getTodayCost(): number {
    const today = new Date().setHours(0, 0, 0, 0);
    return this.records
      .filter(r => r.timestamp >= today)
      .reduce((sum, r) => sum + r.cost, 0);
  }

  getSummary(since?: number): CostSummary {
    const cutoff = since ?? Date.now() - 24 * 60 * 60 * 1000; // Default 24h
    const recent = this.records.filter(r => r.timestamp >= cutoff);

    const byTier: Record<string, { calls: number; cost: number }> = {};
    const byHour: Record<number, number> = {};

    for (const r of recent) {
      byTier[r.tier] = byTier[r.tier] || { calls: 0, cost: 0 };
      byTier[r.tier].calls++;
      byTier[r.tier].cost += r.cost;

      const hour = new Date(r.timestamp).getHours();
      byHour[hour] = (byHour[hour] || 0) + r.cost;
    }

    const totalCost = recent.reduce((sum, r) => sum + r.cost, 0);
    const totalLatency = recent.reduce((sum, r) => sum + r.latencyMs, 0);

    return {
      totalCalls: recent.length,
      totalCost,
      avgCostPerCall: recent.length ? totalCost / recent.length : 0,
      avgLatencyMs: recent.length ? totalLatency / recent.length : 0,
      byTier,
      byHour,
    };
  }

  exportToJson(): string {
    return JSON.stringify({
      exportedAt: Date.now(),
      recordCount: this.records.length,
      records: this.records,
    }, null, 2);
  }

  clear(): void {
    this.records = [];
  }
}
