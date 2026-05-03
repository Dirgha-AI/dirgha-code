/**
 * /provider — manage LLM providers from inside the TUI.
 *
 * Subcommands:
 *   /provider list                 — show registered providers + key status
 *   /provider add <name>           — print the 6-step recipe to scaffold a
 *                                    new provider; pairs with the
 *                                    `add-provider` skill so the agent can
 *                                    do the file edits if asked.
 *   /provider doctor [name]        — quick reachability check
 *
 * Adding a provider is a one-time operation that spans 6 files; the
 * skill doc at src/skills/add-provider.md is the canonical recipe so a
 * future agent can complete the task without out-of-band context.
 */

import type { SlashCommand } from './types.js';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isKnownProvider } from '../../providers/dispatch.js';

/**
 * Provider id → human label + best-for blurb. Source of truth for the
 * /provider list output; kept here (not in dispatch.ts) because dispatch
 * is hot-path code and shouldn't carry display strings.
 *
 * When adding a new provider: extend the ProviderId union in dispatch.ts
 * AND add a row here. The `isKnownProvider` check below catches drift.
 */
const PROVIDER_LABELS: Record<string, { label: string; env: string | null; blurb: string }> = {
  anthropic:  { label: 'Anthropic',     env: 'ANTHROPIC_API_KEY',  blurb: 'Claude — Opus, Sonnet, Haiku · strongest reasoning' },
  openai:     { label: 'OpenAI',        env: 'OPENAI_API_KEY',     blurb: 'GPT-5.5 family · o1 / o3 reasoning models' },
  gemini:     { label: 'Google AI',     env: 'GEMINI_API_KEY',     blurb: 'Gemini Pro / Flash · long context' },
  openrouter: { label: 'OpenRouter',    env: 'OPENROUTER_API_KEY', blurb: '370+ models · free tier (hy3, ling, gemma, nemotron)' },
  nvidia:     { label: 'NVIDIA NIM',    env: 'NVIDIA_API_KEY',     blurb: 'Free tier · Llama 3.3, DeepSeek V4, Qwen 3 (Kimi/MiniMax require NIM Pro)' },
  ollama:     { label: 'Ollama (local)',    env: null,             blurb: 'Privacy-first · zero cost · zero data leaves · ollama.ai' },
  llamacpp:   { label: 'llama.cpp (local)', env: null,            blurb: 'Privacy-first · zero cost · zero data leaves · direct binary' },
  fireworks:  { label: 'Fireworks',     env: 'FIREWORKS_API_KEY',  blurb: 'Hosted open models · fast' },
  deepseek:   { label: 'DeepSeek',      env: 'DEEPSEEK_API_KEY',   blurb: 'Direct DeepSeek API · own quota, no shared 429s' },
  mistral:    { label: 'Mistral',       env: 'MISTRAL_API_KEY',    blurb: 'Mistral Large, Codestral, Magistral' },
  cohere:     { label: 'Cohere',        env: 'COHERE_API_KEY',     blurb: 'Command R / Command A · RAG-tuned' },
  cerebras:   { label: 'Cerebras',      env: 'CEREBRAS_API_KEY',   blurb: 'Wafer-scale inference · very fast' },
  together:   { label: 'Together AI',   env: 'TOGETHER_API_KEY',   blurb: 'Open-source model hub · Llama, Qwen, DeepSeek' },
  perplexity: { label: 'Perplexity',    env: 'PERPLEXITY_API_KEY', blurb: 'Sonar · search-grounded answers' },
  xai:        { label: 'xAI (Grok)',    env: 'XAI_API_KEY',        blurb: 'Grok 4 family · code + reasoning' },
  groq:       { label: 'Groq',          env: 'GROQ_API_KEY',       blurb: 'LPU-accelerated · very low latency' },
  zai:        { label: 'Z.AI / GLM',    env: 'ZAI_API_KEY',        blurb: 'GLM-4.6 · long-context' },
};

const KNOWN_PROVIDERS = Object.keys(PROVIDER_LABELS).filter(p => isKnownProvider(p));

export const providerCommand: SlashCommand = {
  name: 'provider',
  description: 'List, add, or check LLM providers',
  aliases: ['providers'],
  async execute(args, _ctx) {
    const sub = (args[0] ?? 'list').toLowerCase();
    if (sub === 'list') {
      return formatList();
    }
    if (sub === 'add') {
      const name = args[1];
      if (!name) {
        return 'usage: /provider add <name>\n  e.g. /provider add cohere\nThe agent will use the add-provider skill to scaffold the 6 files.';
      }
      return await formatAdd(name);
    }
    if (sub === 'doctor' || sub === 'check') {
      return 'Run `dirgha doctor` for a full health report (reachability + auth per provider).';
    }
    return `unknown subcommand: ${sub}\nTry: /provider list | /provider add <name> | /provider doctor`;
  },
};

function formatList(): string {
  const out = [`Registered providers (${KNOWN_PROVIDERS.length}):`];
  out.push('');
  // Sort: configured (✓) first, then unconfigured. Local providers
  // (no env var) always count as configured — they don't need keys.
  const sortedIds = [...KNOWN_PROVIDERS].sort((a, b) => {
    const aOk = isConfigured(a) ? 0 : 1;
    const bOk = isConfigured(b) ? 0 : 1;
    if (aOk !== bOk) return aOk - bOk;
    return a.localeCompare(b);
  });
  for (const id of sortedIds) {
    const meta = PROVIDER_LABELS[id];
    if (!meta) continue;
    const ok = isConfigured(id);
    const badge = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[33m⚠\x1b[0m';
    const idCell = id.padEnd(12);
    const labelCell = meta.label.padEnd(20);
    const envCell = (meta.env ?? '— (local)').padEnd(20);
    out.push(`  ${badge}  ${idCell} ${labelCell} ${envCell} ${meta.blurb}`);
  }
  out.push('');
  out.push('Legend: ✓ = configured (env var set or local), ⚠ = key not set.');
  out.push('Add a key:  dirgha keys add <ENV_VAR> <key>');
  out.push('Add a new provider:  /provider add <name>');
  return out.join('\n');
}

function isConfigured(id: string): boolean {
  const meta = PROVIDER_LABELS[id];
  if (!meta) return false;
  if (meta.env === null) return true;  // local: always counts as available
  return !!process.env[meta.env];
}

async function formatAdd(name: string): Promise<string> {
  // Read the canonical recipe from the skill doc so output stays in
  // sync with the agent's reference.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', '..', 'skills', 'add-provider.md'),
    join(here, '..', '..', '..', 'src', 'skills', 'add-provider.md'),
  ];
  let recipe: string | null = null;
  for (const path of candidates) {
    try {
      recipe = await readFile(path, 'utf8');
      break;
    } catch {
      // try next
    }
  }
  const header = [
    `Adding provider: ${name}`,
    '',
    'Ask the agent to follow the `add-provider` skill — it will:',
    '  1. Create src/providers/' + name + '.ts (clone openrouter.ts as a template).',
    '  2. Register the provider in src/providers/index.ts.',
    '  3. Add a routing rule in src/providers/dispatch.ts.',
    '  4. Add at least one model row in src/intelligence/prices.ts.',
    '  5. Add the env var to BYOK_KEYS in src/cli/setup.ts.',
    '  6. Add a unit test in src/providers/__tests__/' + name + '.test.ts.',
    '',
    'Verify after with:',
    '  dirgha keys list | grep <ENV_VAR>',
    '  dirgha ask -m <model-id> "ping"',
  ];
  if (recipe) {
    header.push('');
    header.push('--- canonical recipe (src/skills/add-provider.md) ---');
    header.push(recipe);
  }
  return header.join('\n');
}
