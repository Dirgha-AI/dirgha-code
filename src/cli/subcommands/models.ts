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
import { PRICES, contextWindowFor } from '../../intelligence/prices.js';
import { refreshAllModels, readCache, writeCache, isCacheFresh, type ModelsCache } from '../../intelligence/models-refresh.js';
import { listProviders } from '../../auth/providers.js';
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

function runList(json: boolean): number {
  if (json) {
    stdout.write(JSON.stringify(PRICES, null, 2) + "\n");
    return 0;
  }
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
    if (row.family) stdout.write(`  family         ${row.family}\n`);
    // Context window comes from the per-row override OR the canonical
    // CONTEXT_WINDOWS map (in prices.ts) — `contextWindowFor` handles
    // both, falls back to DEFAULT_CONTEXT_WINDOW only when neither has
    // an entry. Surfacing it always so the user always knows the cap.
    stdout.write(`  context        ${contextWindowFor(row.model).toLocaleString()} tokens\n`);
    if (row.maxOutput !== undefined) {
      stdout.write(`  max output     ${row.maxOutput.toLocaleString()} tokens\n`);
    }
    stdout.write(`  input / M      ${priceText(row.inputPerM)}\n`);
    stdout.write(`  output / M     ${priceText(row.outputPerM)}\n`);
    if (row.cachedInputPerM !== undefined) stdout.write(`  cached in / M  $${row.cachedInputPerM.toFixed(2)}\n`);
    if (row.supportsTools !== undefined) {
      stdout.write(`  tools          ${row.supportsTools ? 'yes' : 'no'}\n`);
    }
    if (row.supportsThinking !== undefined) {
      stdout.write(`  thinking       ${row.supportsThinking ? 'yes' : 'no'}\n`);
    }
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

const CACHE_PATH = join(homedir(), '.dirgha', 'models-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function runRefresh(jsonOut: boolean): Promise<number> {
  const targets = listProviders().map(p => ({
    name: p.id,
    baseUrl: p.baseUrl ?? '',
    apiKey: process.env[p.envVars[0]],
  })).filter(t => t.baseUrl && t.apiKey);
  if (targets.length === 0) {
    stderr.write(style(defaultTheme.muted, '(no provider keys present in env / pool — set at least one with `dirgha login --provider=...`)\n'));
    return 1;
  }
  stdout.write(style(defaultTheme.muted, `fetching ${targets.length} provider${targets.length === 1 ? '' : 's'} in parallel…\n`));
  const cache = await refreshAllModels({ providers: targets });
  await mkdir(join(homedir(), '.dirgha'), { recursive: true });
  await writeCache(CACHE_PATH, cache);
  if (jsonOut) { stdout.write(`${JSON.stringify(cache)}\n`); return 0; }
  stdout.write(style(defaultTheme.accent, `\n${cache.totalModels} models across ${cache.providers.length} providers\n`));
  for (const p of cache.providers) {
    const tag = p.error ? style(defaultTheme.danger, `error: ${p.error}`) : style(defaultTheme.success, `${p.models.length} models`);
    stdout.write(`  ${p.name.padEnd(14)}  ${tag}\n`);
  }
  stdout.write(style(defaultTheme.muted, `\ncached at ${CACHE_PATH}\n`));
  return 0;
}

async function runCacheShow(jsonOut: boolean): Promise<number> {
  const cache = await readCache(CACHE_PATH);
  if (!cache) {
    stderr.write(style(defaultTheme.muted, '(no cache yet — run `dirgha models refresh`)\n'));
    return 1;
  }
  const fresh = isCacheFresh(cache, CACHE_TTL_MS);
  if (jsonOut) { stdout.write(`${JSON.stringify({ ...cache, fresh })}\n`); return 0; }
  stdout.write(style(defaultTheme.accent, `Models cache (${fresh ? 'fresh' : 'stale, refresh recommended'})\n`));
  stdout.write(style(defaultTheme.muted, `fetched: ${cache.fetchedAt}\n`));
  for (const p of cache.providers) {
    const head = `  ${p.name.padEnd(14)}`;
    if (p.error) { stdout.write(`${head} ${style(defaultTheme.danger, p.error)}\n`); continue; }
    stdout.write(`${head} ${p.models.length} models\n`);
  }
  return 0;
}

export const modelsSubcommand: Subcommand = {
  name: 'models',
  description: 'List, inspect, and refresh the live model catalogue',
  async run(argv): Promise<number> {
    const json = argv.includes('--json');
    const args = argv.filter(a => a !== '--json');
    const [op, arg] = args;
    if (!op || op === 'list') return runList(json);
    if (op === 'default') return runDefault(arg);
    if (op === 'info') {
      if (!arg) { stderr.write(`${usage()}\n`); return 1; }
      return runInfo(arg);
    }
    if (op === 'refresh') return runRefresh(json);
    if (op === 'cache')   return runCacheShow(json);
    // Single bare model id? treat it as a shorthand for `info <id>`.
    if (!arg && PRICES.some(p => p.model === op)) return runInfo(op);
    stderr.write(`unknown subcommand "${op}"\n${usage()}\n`);
    return 1;
  },
};
// Type assertion to silence ModelsCache import (kept for external consumers).
void ({} as ModelsCache);
