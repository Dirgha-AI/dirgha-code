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

const KNOWN_PROVIDERS = [
  'anthropic',
  'openai',
  'gemini',
  'openrouter',
  'nvidia',
  'ollama',
  'llamacpp',
  'fireworks',
  'deepseek',
] as const;

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
  const out = ['Registered providers:'];
  for (const id of KNOWN_PROVIDERS) {
    out.push(`  ${id.padEnd(12)}`);
  }
  out.push('');
  out.push('Add a new one with:  /provider add <name>');
  return out.join('\n');
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
