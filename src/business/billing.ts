/**
 * business/billing.ts — Usage attribution per org/project
 */
import type { BillingContext } from './types.js';

const usage: Map<string, { tokens: number; cost: number; calls: number }> = new Map();

export function trackUsage(
  orgId: string,
  projectId: string,
  tokens: number,
  cost: number
): void {
  const key = `${orgId}:${projectId}`;
  const current = usage.get(key) || { tokens: 0, cost: 0, calls: 0 };
  
  usage.set(key, {
    tokens: current.tokens + tokens,
    cost: current.cost + cost,
    calls: current.calls + 1
  });
}

export function getUsage(orgId: string, projectId?: string): { tokens: number; cost: number; calls: number } {
  if (projectId) {
    return usage.get(`${orgId}:${projectId}`) || { tokens: 0, cost: 0, calls: 0 };
  }
  
  // Sum across all projects in org
  let total = { tokens: 0, cost: 0, calls: 0 };
  for (const [key, val] of usage) {
    if (key.startsWith(`${orgId}:`)) {
      total.tokens += val.tokens;
      total.cost += val.cost;
      total.calls += val.calls;
    }
  }
  return total;
}

export function checkBudget(context: BillingContext): { ok: boolean; remaining: number } {
  const used = context.usedThisMonth;
  return {
    ok: used < context.monthlyBudget,
    remaining: context.monthlyBudget - used
  };
}
