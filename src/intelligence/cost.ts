/**
 * Cost tracker. Accumulates token usage by session and translates it to
 * USD via the price catalogue. Supports per-session budgets that
 * report when the budget is close or exceeded; enforcement is the
 * caller's responsibility (typically the agent loop).
 */

import type { UsageTotal } from '../kernel/types.js';
import { findPrice } from './prices.js';

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
  budget(sessionId: string, budgetUsd: number): { withinBudget: boolean; used: number; remaining: number };
}

export function createCostTracker(): CostTracker {
  const records: CostRecord[] = [];

  return {
    record(provider, model, usage, sessionId) {
      const price = findPrice(provider, model);
      const costUsd = price
        ? (usage.inputTokens / 1_000_000) * price.inputPerM
        + (usage.outputTokens / 1_000_000) * price.outputPerM
        + (usage.cachedTokens / 1_000_000) * (price.cachedInputPerM ?? 0)
        : 0;
      const rec: CostRecord = {
        sessionId,
        provider,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        costUsd,
        ts: new Date().toISOString(),
      };
      records.push(rec);
      return rec;
    },
    sessionTotal(sessionId) {
      return accumulate(records.filter(r => r.sessionId === sessionId));
    },
    dailyTotal(date) {
      const prefix = date ?? new Date().toISOString().slice(0, 10);
      return accumulate(records.filter(r => r.ts.startsWith(prefix)));
    },
    budget(sessionId, budgetUsd) {
      const total = this.sessionTotal(sessionId);
      return {
        used: total.costUsd,
        remaining: Math.max(0, budgetUsd - total.costUsd),
        withinBudget: total.costUsd <= budgetUsd,
      };
    },
  };
}

function accumulate(records: CostRecord[]): UsageTotal {
  const totals: UsageTotal = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 };
  for (const r of records) {
    totals.inputTokens += r.inputTokens;
    totals.outputTokens += r.outputTokens;
    totals.cachedTokens += r.cachedTokens;
    totals.costUsd += r.costUsd;
  }
  return totals;
}
