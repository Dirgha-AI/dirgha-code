/**
 * /setup — minimal first-run wizard accessible from inside the REPL.
 * The full wizard (../setup.ts) uses readline and takes over stdin,
 * which is incompatible with the REPL loop. Instead, /setup shows the
 * status of each provider + points to `dirgha setup` on the CLI.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SlashCommand } from './types.js';

const PROVIDERS = [
  { label: 'NVIDIA NIM', env: 'NVIDIA_API_KEY' },
  { label: 'OpenRouter', env: 'OPENROUTER_API_KEY' },
  { label: 'Anthropic',  env: 'ANTHROPIC_API_KEY' },
  { label: 'OpenAI',     env: 'OPENAI_API_KEY' },
  { label: 'Google AI',  env: 'GEMINI_API_KEY' },
];

async function readStoredKeys(): Promise<Record<string, string>> {
  const path = join(homedir(), '.dirgha', 'keys.json');
  const text = await readFile(path, 'utf8').catch(() => '');
  if (!text) return {};
  try { return JSON.parse(text) as Record<string, string>; } catch { return {}; }
}

export const setupCommand: SlashCommand = {
  name: 'setup',
  description: 'Show provider key status and point at the full wizard',
  async execute(_args, ctx) {
    const stored = await readStoredKeys();
    const lines = ['Provider status:'];
    for (const p of PROVIDERS) {
      const fromEnv = process.env[p.env] && process.env[p.env]!.length > 0;
      const fromStore = stored[p.env] && stored[p.env].length > 0;
      const state = fromEnv ? 'env' : fromStore ? 'stored' : 'missing';
      lines.push(`  ${p.label.padEnd(14)}  ${p.env.padEnd(22)}  ${state}`);
    }
    lines.push('');
    lines.push(`Current model: ${ctx.model}`);
    lines.push('');
    lines.push('Full interactive wizard: exit the REPL and run `dirgha setup`.');
    lines.push('Quick key add inside the REPL: `/keys set <ENV> <value>`.');
    lines.push('Pick a default model: `/models` then `/models <n>`.');
    return lines.join('\n');
  },
};
