/**
 * billing/pricing.ts — Model pricing and cost calculation
 */
import type { ModelPricing } from './types.js';

// Pricing: USD per 1K tokens (input, output)
const PRICING_TABLE: Record<string, [number, number]> = {
  // OpenAI
  'gpt-4o': [0.005, 0.015],
  'gpt-4o-mini': [0.00015, 0.0006],
  'gpt-4-turbo': [0.01, 0.03],
  'gpt-4': [0.03, 0.06],
  // Anthropic
  'claude-3-5-sonnet': [0.003, 0.015],
  'claude-3-opus': [0.015, 0.075],
  'claude-3-haiku': [0.00025, 0.00125],
  // Fireworks
  'llama-v3p1-70b-instruct': [0.0009, 0.0009],
  'llama-v3p1-405b-instruct': [0.003, 0.003],
  // OpenRouter
  'openrouter/anthropic/claude-3.5-sonnet': [0.003, 0.015],
  'openrouter/meta-llama/llama-3.1-70b-instruct': [0.00059, 0.00079],
  // Default fallback
  'default': [0.001, 0.003],
};

export function getPricing(model: string): ModelPricing {
  const [inputPrice, outputPrice] = PRICING_TABLE[model] ?? PRICING_TABLE['default'];
  return {
    model,
    provider: detectProvider(model),
    inputPricePer1k: inputPrice,
    outputPricePer1k: outputPrice,
  };
}

export function calculateCost(inputTokens: number, outputTokens: number, model: string): number {
  const pricing = getPricing(model);
  const inputCost = (inputTokens / 1000) * pricing.inputPricePer1k;
  const outputCost = (outputTokens / 1000) * pricing.outputPricePer1k;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal precision
}

function detectProvider(model: string): string {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.includes('llama')) return 'fireworks';
  if (model.startsWith('openrouter')) return 'openrouter';
  if (model.startsWith('gpt')) return 'openai';
  return 'unknown';
}
