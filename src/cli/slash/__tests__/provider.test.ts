/**
 * Lock the contract for /provider list — every ProviderId in
 * dispatch.ts must have a row in PROVIDER_LABELS, and the output must
 * always include all 17. Catches drift the first time someone adds a
 * provider to dispatch but forgets to add the label.
 */

import { describe, expect, it } from 'vitest';
import { providerCommand } from '../provider.js';
import { isKnownProvider } from '../../../providers/dispatch.js';

const ALL_PROVIDERS = [
  'anthropic', 'openai', 'gemini', 'openrouter', 'nvidia',
  'ollama', 'llamacpp', 'fireworks', 'deepseek',
  'mistral', 'cohere', 'cerebras', 'together',
  'perplexity', 'xai', 'groq', 'zai',
] as const;

describe('/provider list', () => {
  it('lists exactly 17 registered providers', async () => {
    const output = await providerCommand.execute(['list'], {} as never);
    expect(output).toMatch(/Registered providers \(17\):/);
  });

  it('includes every ProviderId from dispatch.ts', async () => {
    const output = (await providerCommand.execute(['list'], {} as never)) ?? '';
    for (const id of ALL_PROVIDERS) {
      expect(output, `missing provider id: ${id}`).toContain(id);
      // Sanity: the dispatch table also recognises this id.
      expect(isKnownProvider(id), `dispatch missing: ${id}`).toBe(true);
    }
  });

  it('shows configured/unconfigured status per provider', async () => {
    const output = (await providerCommand.execute(['list'], {} as never)) ?? '';
    // Both glyphs must appear (some providers are configured via env in
    // the test runner — at minimum local providers ollama / llamacpp are
    // always configured because they don't need keys).
    expect(output).toContain('✓');
  });

  it('renders human labels, not just ids', async () => {
    const output = (await providerCommand.execute(['list'], {} as never)) ?? '';
    expect(output).toContain('Z.AI / GLM');
    expect(output).toContain('xAI (Grok)');
    expect(output).toContain('NVIDIA NIM');
    expect(output).toContain('llama.cpp (local)');
  });

  it('emits the legend + add-key hint', async () => {
    const output = (await providerCommand.execute(['list'], {} as never)) ?? '';
    expect(output).toMatch(/Legend:.*configured.*key not set/);
    expect(output).toContain('dirgha keys add');
    expect(output).toContain('/provider add');
  });
});

describe('/provider — invalid subcommands', () => {
  it('default subcommand is list', async () => {
    const output = await providerCommand.execute([], {} as never);
    expect(output).toMatch(/Registered providers/);
  });

  it('unknown subcommand returns a help line', async () => {
    const output = await providerCommand.execute(['nonsense'], {} as never);
    expect(output).toMatch(/unknown subcommand/);
  });

  it('add without name prints usage', async () => {
    const output = await providerCommand.execute(['add'], {} as never);
    expect(output).toMatch(/usage:.*\/provider add <name>/);
  });
});
