/**
 * `dirgha setup` — quick BYOK onboarding.
 *
 * Non-interactive sibling of `cli/setup.ts`. Asks for a preferred
 * provider and optional API keys, then persists them to
 * `~/.dirgha/keys.json` (mode 0600). Falls back to a how-to doc when
 * stdin is not a TTY or `--interactive=false` is passed.
 */

import { stdin, stdout } from 'node:process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defaultTheme, style } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

interface ProviderSpec {
  label: string;
  env: string;
  helpUrl: string;
}

const PROVIDERS: ProviderSpec[] = [
  { label: 'NVIDIA NIM',  env: 'NVIDIA_API_KEY',     helpUrl: 'https://build.nvidia.com/settings/api-keys' },
  { label: 'OpenRouter',  env: 'OPENROUTER_API_KEY', helpUrl: 'https://openrouter.ai/keys' },
  { label: 'Anthropic',   env: 'ANTHROPIC_API_KEY',  helpUrl: 'https://console.anthropic.com/settings/keys' },
  { label: 'OpenAI',      env: 'OPENAI_API_KEY',     helpUrl: 'https://platform.openai.com/api-keys' },
  { label: 'Gemini',      env: 'GEMINI_API_KEY',     helpUrl: 'https://aistudio.google.com/apikey' },
];

function keysPath(): string {
  return join(homedir(), '.dirgha', 'keys.json');
}

async function readKeys(): Promise<Record<string, string>> {
  const text = await readFile(keysPath(), 'utf8').catch(() => '');
  if (!text) return {};
  try { return JSON.parse(text) as Record<string, string>; } catch { return {}; }
}

async function writeKeys(store: Record<string, string>): Promise<void> {
  const path = keysPath();
  await mkdir(join(homedir(), '.dirgha'), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  try { await chmod(path, 0o600); } catch { /* non-POSIX */ }
}

function parseInteractiveFlag(argv: string[]): boolean {
  for (const a of argv) {
    if (a === '--interactive=false' || a === '--non-interactive') return false;
    if (a === '--interactive=true' || a === '--interactive') return true;
  }
  return stdin.isTTY === true;
}

function printHowTo(): void {
  stdout.write(`${style(defaultTheme.accent, '\ndirgha setup')}\n\n`);
  stdout.write(`Non-interactive context detected. Configure BYOK manually:\n\n`);
  for (const p of PROVIDERS) {
    stdout.write(`  ${p.label.padEnd(12)} export ${p.env}=<key>   (${p.helpUrl})\n`);
  }
  stdout.write(`\nOr edit ${keysPath()} directly:\n`);
  stdout.write(`  { "NVIDIA_API_KEY": "nvapi-…", "OPENAI_API_KEY": "sk-…" }\n`);
  stdout.write(`\nTo sign in with a hosted account instead: dirgha login\n`);
}

export async function runSetup(argv: string[]): Promise<number> {
  const interactive = parseInteractiveFlag(argv);
  if (!interactive) { printHowTo(); return 0; }

  const rl = createInterface({ input: stdin, output: stdout });
  const ask = (q: string, dflt?: string): Promise<string> => new Promise(resolve => {
    rl.question(`${q}${dflt ? ` [${dflt}]` : ''}: `, ans => resolve(ans.trim() || dflt || ''));
  });

  stdout.write(`${style(defaultTheme.accent, '\ndirgha setup')} — BYOK keys saved to ~/.dirgha/keys.json\n\n`);
  PROVIDERS.forEach((p, i) => { stdout.write(`  ${i + 1}. ${p.label}\n`); });
  const pick = await ask('\nPreferred provider (number or name, blank to skip)', '1');

  const store = await readKeys();
  const chosen = PROVIDERS.find((p, i) => `${i + 1}` === pick || p.label.toLowerCase() === pick.toLowerCase() || p.env === pick);

  if (chosen) {
    stdout.write(`\n${chosen.label}  —  ${chosen.helpUrl}\n`);
    const key = await ask(`  ${chosen.env}`);
    if (key) store[chosen.env] = key;
  }

  const addMore = (await ask('\nAdd keys for other providers? (y/N)', 'n')).toLowerCase();
  if (addMore === 'y' || addMore === 'yes') {
    for (const p of PROVIDERS) {
      if (chosen && p.env === chosen.env) continue;
      const existing = store[p.env];
      const key = await ask(`  ${p.env}`, existing ? '<keep>' : '<skip>');
      if (key && key !== '<skip>' && key !== '<keep>') store[p.env] = key;
    }
  }

  rl.close();
  await writeKeys(store);
  stdout.write(`${style(defaultTheme.success, '\n✓ Saved.')} Keys stored at ${keysPath()} (0600).\n`);
  stdout.write(`\nTip: sign in with a hosted account for quota + billing → ${style(defaultTheme.accent, 'dirgha login')}\n`);
  return 0;
}

export const setupSubcommand: Subcommand = {
  name: 'setup',
  description: 'Configure BYOK provider keys',
  async run(argv) { return runSetup(argv); },
};
