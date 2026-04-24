import { describe, expect, it } from 'vitest';
import { routeModel, isKnownProvider } from '../dispatch.js';

describe('routeModel', () => {
  it.each([
    ['anthropic/claude-opus-4-7', 'anthropic'],
    ['claude-sonnet-4-6', 'anthropic'],
    ['openai/gpt-4o', 'openai'],
    ['gpt-4o-mini', 'openai'],
    ['o1-preview', 'openai'],
    ['google/gemini-2.5-pro', 'gemini'],
    ['gemini-2.5-flash', 'gemini'],
    ['inclusionai/ling-2.6-1t:free', 'openrouter'],
    ['openrouter/x-ai/grok-4', 'openrouter'],
    ['moonshotai/kimi-k2-instruct', 'nvidia'],
    ['minimaxai/minimax-m2', 'nvidia'],
    ['z-ai/glm-5.1', 'nvidia'],
    ['meta/llama-3.1-70b-instruct', 'nvidia'],
    ['ollama/llama3', 'ollama'],
    ['fireworks/kimi-k2', 'fireworks'],
  ])('routes %s → %s', (modelId, expected) => {
    expect(routeModel(modelId)).toBe(expected);
  });

  it('throws on unknown prefix', () => {
    expect(() => routeModel('unknown-provider/something')).toThrow();
  });
});

describe('isKnownProvider', () => {
  it('accepts configured providers', () => {
    expect(isKnownProvider('nvidia')).toBe(true);
    expect(isKnownProvider('openrouter')).toBe(true);
    expect(isKnownProvider('anthropic')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isKnownProvider('bedrock')).toBe(false);
  });
});
