import { describe, it, expect } from 'vitest';
import type { ModelsDevCatalog, ModelsDevProvider, ModelsDevModel } from '../models-dev-sync.js';

// Pure-shape tests. The network round-trip is exercised manually
// via `node scripts/...` — vitest stays offline by default.
describe('models-dev-sync types', () => {
  it('catalog shape', () => {
    const cat: ModelsDevCatalog = {
      fetchedAt: new Date().toISOString(),
      providerCount: 1,
      modelCount: 1,
      providers: {
        anthropic: {
          id: 'anthropic',
          name: 'Anthropic',
          apiBase: null,
          envKeys: ['ANTHROPIC_API_KEY'],
          docUrl: 'https://docs.anthropic.com',
          models: [
            {
              id: 'claude-opus-4-5',
              name: 'Claude Opus 4.5',
              contextWindow: 200000,
              maxOutput: 8192,
              cost: { inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 },
              capabilities: { tools: true, reasoning: true, attachments: true },
              modalities: { input: ['text', 'image'], output: ['text'] },
            },
          ],
        },
      },
    };
    expect(cat.providerCount).toBe(1);
    expect(cat.providers.anthropic?.models[0]?.cost.inputPerM).toBe(5);
    expect(cat.providers.anthropic?.models[0]?.capabilities.tools).toBe(true);
  });

  it('provider with no models is valid', () => {
    const p: ModelsDevProvider = {
      id: 'empty',
      name: 'Empty',
      apiBase: null,
      envKeys: [],
      models: [],
    };
    expect(p.models).toHaveLength(0);
  });

  it('model accepts optional cache costs', () => {
    const noCache: ModelsDevModel = {
      id: 'free-model',
      name: 'Free Model',
      contextWindow: 32000,
      maxOutput: 4096,
      cost: { inputPerM: 0, outputPerM: 0 },
      capabilities: { tools: false, reasoning: false, attachments: false },
      modalities: { input: ['text'], output: ['text'] },
    };
    expect(noCache.cost.cacheReadPerM).toBeUndefined();
  });
});
