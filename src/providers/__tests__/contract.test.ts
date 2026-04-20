/**
 * Provider contract test.
 * Validates routing logic without live API calls.
 * Integration mode (DIRGHA_CONTRACT_TEST=1) sends real 5-word prompts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { providerFromModelId, providerForModel } from '../dispatch.js';

// Model → expected provider mapping (routing contract)
const ROUTING_TABLE: [string, string][] = [
  ['claude-sonnet-4-6',                        'anthropic'],
  ['claude-haiku-4-5',                         'anthropic'],
  ['gpt-4o',                                   'openai'],
  ['openrouter/elephant-alpha',                'openrouter'],
  ['openrouter/auto',                          'openrouter'],
  ['minimaxai/minimax-m2.7',                   'nvidia'],
  ['grok-3-mini',                              'xai'],
  ['gemini-2.0-flash',                         'gemini'],
  ['mistral-large-latest',                     'mistral'],
  ['command-r-plus',                           'cohere'],
  ['llama3-70b-versatile',                     'groq'],
  ['accounts/fireworks/models/llama-v3p3-70b', 'fireworks'],
];

describe('provider routing contract', () => {
  for (const [model, expected] of ROUTING_TABLE) {
    it(`${model} → ${expected}`, () => {
      const got = providerFromModelId(model);
      expect(got).toBe(expected);
    });
  }

  it('rejects bare unqualified model IDs (falls through to env/detection)', () => {
    // bare names have no prefix — providerFromModelId returns null, caller falls back
    expect(providerFromModelId('llama3')).toBeNull();
    expect(providerFromModelId('mistral')).toBeNull();
  });
});

describe('death spiral integration (unit)', () => {
  it('globalLimiter.shouldAbortRouting returns false when no 429s recorded', async () => {
    const { globalLimiter } = await import('../unified-rate-limiter.js');
    // Fresh limiter — no retry-after data, should not abort
    expect(globalLimiter.shouldAbortRouting(['anthropic', 'openrouter'])).toBe(false);
  });
});

// Integration tests — only run when DIRGHA_CONTRACT_TEST=1 and keys are set
const RUN_INTEGRATION = process.env['DIRGHA_CONTRACT_TEST'] === '1';

describe.skipIf(!RUN_INTEGRATION)('live provider contract (integration)', () => {
  it('openrouter/elephant-alpha: returns non-empty string', async () => {
    const { callModel } = await import('../dispatch.js');
    const res = await callModel(
      [{ role: 'user', content: 'Reply: yes' }],
      'You are a test assistant. Reply with exactly one word.',
      'openrouter/elephant-alpha',
    );
    const text = res.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
    expect(text.trim().length).toBeGreaterThan(0);
  });
});
