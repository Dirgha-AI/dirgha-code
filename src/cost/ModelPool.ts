/**
 * cost/ModelPool.ts — 4-Tier Model Pool per ADR-001
 * Premium/Standard/Economy/Local routing with cost-based selection
 */

export type TierName = 'premium' | 'standard' | 'economy' | 'local';

export interface ModelTier {
  name: TierName;
  provider: string;
  model: string;
  costPerMtok: number;  // $ per million tokens
  accuracyTarget: number;
  maxLatencyMs: number;
}

export const TIERS: ModelTier[] = [
  {
    name: 'premium',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    costPerMtok: 3.0,
    accuracyTarget: 0.98,
    maxLatencyMs: 5000,
  },
  {
    name: 'standard',
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    costPerMtok: 0.25,
    accuracyTarget: 0.95,
    maxLatencyMs: 2000,
  },
  {
    name: 'economy',
    provider: 'groq',
    model: 'llama-3.1-70b-versatile',
    costPerMtok: 0.59,
    accuracyTarget: 0.90,
    maxLatencyMs: 1000,
  },
  {
    name: 'local',
    provider: 'ollama',
    model: 'gemma-4',
    costPerMtok: 0,
    accuracyTarget: 0.85,
    maxLatencyMs: 500,
  },
];

export interface TaskProfile {
  complexity: number;      // 0-1 estimated complexity
  accuracyRequired: number; // 0-1 minimum accuracy needed
  latencyRequirement: 'strict' | 'normal' | 'relaxed';
  estimatedTokens: number;
}

export class ModelPool {
  private tiers = TIERS;

  selectTier(task: TaskProfile): ModelTier {
    // Accuracy gate: must meet minimum accuracy
    const viableTiers = this.tiers.filter(t => t.accuracyTarget >= task.accuracyRequired);
    if (viableTiers.length === 0) return this.tiers[0]; // Fallback to premium

    // Latency-sensitive tasks get faster tiers
    if (task.latencyRequirement === 'strict') {
      return viableTiers.find(t => t.maxLatencyMs <= 2000) || viableTiers[0];
    }

    // Cost optimization: pick cheapest viable tier
    return viableTiers.reduce((cheapest, tier) =>
      tier.costPerMtok < cheapest.costPerMtok ? tier : cheapest
    );
  }

  getTier(name: TierName): ModelTier | undefined {
    return this.tiers.find(t => t.name === name);
  }

  estimateCost(task: TaskProfile): number {
    const tier = this.selectTier(task);
    return (task.estimatedTokens / 1_000_000) * tier.costPerMtok;
  }

  getAllTiers(): ModelTier[] {
    return [...this.tiers];
  }
}
