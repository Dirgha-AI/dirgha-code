/**
 * `dirgha models <list|default|info>` — richer model management.
 *
 *   list                      Table of every model in the catalogue.
 *   default [modelId]         Print the current default, or persist
 *                             `modelId` into ~/.dirgha/config.json.
 *   info <modelId>            Pricing + provider + rough context
 *                             window for a single model.
 *
 * Complements the simpler `dirgha models` already implemented in
 * `models-cmd.ts`; this subcommand supersedes it via the dispatcher.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdout, stderr } from 'node:process';
import { PRICES } from '../../intelligence/prices.js';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

const PROVIDER_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  ollama: '',
};

function configPath(): string {
  return join(homedir(), '.dirgha', 'config.json');
}

async function readConfig(): Promise<Record<string, unknown>> {
  const text = await readFile(configPath(), 'utf8').catch(() => '');
  if (!text) return {};
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}

async function writeConfig(cfg: Record<string, unknown>): Promise<void> {
  await mkdir(join(homedir(), '.dirgha'), { recursive: true });
  await writeFile(configPath(), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

function configured(provider: string): boolean {
  const env = PROVIDER_ENV[provider];
  if (!env) return true;
  const raw = process.env[env];
  return Boolean(raw && raw.length > 0);
}

function priceText(value: number): string {
  return value === 0 ? 'free' : `$${value.toFixed(2)}/M`;
}

function runList(): number {
  stdout.write(`\n${style(defaultTheme.accent, 'Model catalogue')}\n`);
  const byProvider = new Map<string, typeof PRICES>();
  for (const row of PRICES) {
    const bucket = byProvider.get(row.provider) ?? [];
    bucket.push(row);
    byProvider.set(row.provider, bucket);
  }
  for (const [provider, rows] of byProvider) {
    const env = PROVIDER_ENV[provider] ?? '';
    const marker = configured(provider)
      ? style(defaultTheme.success, 'configured')
      : style(defaultTheme.muted, env ? `set ${env} to enable` : 'no key required');
    stdout.write(`\n${style(defaultTheme.userPrompt, provider)}  (${marker})\n`);
    for (const row of rows) {
      stdout.write(`  ${row.model.padEnd(44)}  in ${priceText(row.inputPerM).padEnd(10)} out ${priceText(row.outputPerM)}\n`);
    }
  }
  stdout.write(`\nUse \`dirgha models default <id>\` to persist a new default.\n`);
  return 0;
}

async function runDefault(id: string | undefined): Promise<number> {
  if (!id) {
    const cfg = await readConfig();
    const current = typeof cfg.model === 'string' ? cfg.model : process.env.DIRGHA_MODEL ?? '(using DEFAULT_CONFIG)';
    stdout.write(`${current}\n`);
    return 0;
  }
  const match = PRICES.find(p => p.model === id);
  if (!match) {
    stderr.write(`${id} is not in the catalogue. Models with no route will still work if the provider accepts it.\n`);
  }
  const cfg = await readConfig();
  cfg.model = id;
  await writeConfig(cfg);
  stdout.write(`${style(defaultTheme.success, '✓')} default model set to ${id}${match ? ` (${match.provider})` : ''}\n`);
  return 0;
}

function runInfo(id: string): number {
  const all = PRICES.filter(p => p.model === id);
  if (all.length === 0) {
    stderr.write(`model "${id}" is not in the catalogue\n`);
    return 1;
  }
  for (const row of all) {
    stdout.write(`\n${style(defaultTheme.accent, row.model)}\n`);
    stdout.write(`  provider       ${row.provider}\n`);
    stdout.write(`  input / M      ${priceText(row.inputPerM)}\n`);
    stdout.write(`  output / M     ${priceText(row.outputPerM)}\n`);
    if (row.cachedInputPerM !== undefined) stdout.write(`  cached in / M  $${row.cachedInputPerM.toFixed(2)}\n`);
    const env = PROVIDER_ENV[row.provider] ?? '';
    const marker = configured(row.provider) ? 'configured' : env ? `set ${env} to enable` : 'no key required';
    stdout.write(`  configured?    ${marker}\n`);
  }
  stdout.write('\n');
  return 0;
}

function usage(): string {
  return [
    'usage:',
    '  dirgha models list',
    '  dirgha models default [modelId]',
    '  dirgha models info <modelId>',
  ].join('\n');
}

export const modelsSubcommand: Subcommand = {
  name: 'models',
  description: 'List, inspect, and set the default model',
  async run(argv): Promise<number> {
    const [op, arg] = argv;
    if (!op || op === 'list') return runList();
    if (op === 'default') return runDefault(arg);
    if (op === 'info') {
      if (!arg) { stderr.write(`${usage()}\n`); return 1; }
      return runInfo(arg);
    }
    // Single bare model id? treat it as a shorthand for `info <id>`.
    if (!arg && PRICES.some(p => p.model === op)) return runInfo(op);
    stderr.write(`unknown subcommand "${op}"\n${usage()}\n`);
    return 1;
  },
};
