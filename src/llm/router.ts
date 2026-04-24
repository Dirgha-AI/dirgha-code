/**
 * llm/router.ts — Smart model routing
 */
import type { ModelDefinition, RoutingDecision } from './types.js';

export const MODEL_REGISTRY: ModelDefinition[] = [
  {
    name: 'claude-haiku-4-5',
    provider: 'anthropic',
    costPer1KTokens: 0.5,
    maxTokens: 4096,
    contextWindow: 200000,
    quality: 'low'
  },
  {
    name: 'claude-3-sonnet-20240229',
    provider: 'anthropic',
    costPer1KTokens: 3,
    maxTokens: 4096,
    contextWindow: 200000,
    supportsCaching: true,
    quality: 'medium'
  },
  {
    name: 'claude-3-opus-20240229',
    provider: 'anthropic',
    costPer1KTokens: 15,
    maxTokens: 4096,
    contextWindow: 200000,
    supportsCaching: true,
    quality: 'high'
  },
  {
    name: 'gpt-4o-mini',
    provider: 'openai',
    costPer1KTokens: 0.6,
    maxTokens: 16384,
    contextWindow: 128000,
    quality: 'low'
  }
];

export function shouldUseCheapModel(query: string): boolean {
  return (
    query.length < 160 &&
    query.split(' ').length <= 28 &&
    !query.includes('`') &&
    !query.includes('http') &&
    !query.includes('\n')
  );
}

export function routeModel(query: string, contextSize: number): RoutingDecision {
  // Short simple queries → cheap model
  if (shouldUseCheapModel(query)) {
    return {
      model: 'claude-haiku-4-5',
      reason: 'short_query',
      estimatedCost: (query.length / 4) * 0.0005
    };
  }
  
  // Long context → model with big window
  if (contextSize > 150000) {
    return {
      model: 'claude-3-sonnet-20240229',
      reason: 'long_context',
      estimatedCost: (contextSize / 1000) * 0.003
    };
  }
  
  // Default
  return {
    model: 'claude-3-sonnet-20240229',
    reason: 'default',
    estimatedCost: (query.length / 4 / 1000) * 3
  };
}
