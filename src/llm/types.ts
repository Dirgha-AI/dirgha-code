/**
 * llm/types.ts — LLM routing types
 */
export interface ModelDefinition {
  name: string;
  provider: string;
  costPer1KTokens: number;
  maxTokens: number;
  contextWindow: number;
  supportsCaching?: boolean;
  supportsVision?: boolean;
  quality: 'low' | 'medium' | 'high';
}

export interface RoutingDecision {
  model: string;
  reason: 'short_query' | 'long_context' | 'code_task' | 'vision_required' | 'default';
  estimatedCost: number;
}
