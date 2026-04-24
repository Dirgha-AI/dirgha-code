/**
 * `dirgha keys <list|set|get|clear>` — BYOK key store at
 * `~/.dirgha/keys.json` (mode 0600).
 *
 * Mirrors the `/keys` slash but is callable non-interactively from
 * shells and scripts. `list` masks values; `get` prints the raw value
 * (supported but noisy by design so nobody leans on it). `set` writes
 * the file with a 0600 chmod. `clear` removes one key or everything
 * when given `all`.
 */

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdout, stderr } from 'node:process';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

const KNOWN_PROVIDERS = [
  'NVIDIA_API_KEY',
  'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'FIREWORKS_API_KEY',
];

interface KeyStore { [envVar: string]: string }

function keyPath(): string {
  return join(homedir(), '.dirgha', 'keys.json');
}

async function read(): Promise<KeyStore> {
  const text = await readFile(keyPath(), 'utf8').catch(() => '');
  if (!text) return {};
  try { return JSON.parse(text) as KeyStore; } catch { return {}; }
}

async function write(store: KeyStore): Promise<void> {
  const path = keyPath();
  await mkdir(join(homedir(), '.dirgha'), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2) + '\n', 'utf8');
  try { await chmod(path, 0o600); } catch { /* non-POSIX */ }
}

function mask(value: string): string {
  if (value.length < 10) return '***';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function usage(): string {
  return [
    'usage:',
    '  dirgha keys list                 List stored keys (masked)',
    '  dirgha keys set <ENV> <value>    Set a provider key',
    '  dirgha keys get <ENV>            Print the raw value (avoid; use env vars)',
    '  dirgha keys clear <ENV>          Remove a key',
    '  dirgha keys clear all            Remove every key',
    `known: ${KNOWN_PROVIDERS.join(', ')}`,
  ].join('\n');
}

async function runList(): Promise<number> {
  const store = await read();
  const all = new Set<string>([...KNOWN_PROVIDERS, ...Object.keys(store)]);
  stdout.write(`${style(defaultTheme.accent, 'Stored keys')}\n`);
  for (const key of [...all].sort()) {
    const stored = store[key];
    const envInherit = process.env[key];
    const state = stored
      ? style(defaultTheme.success, `stored  ${mask(stored)}`)
      : envInherit
        ? style(defaultTheme.muted, `env     ${mask(envInherit)}`)
        : style(defaultTheme.muted, 'unset');
    stdout.write(`  ${key.padEnd(22)} ${state}\n`);
  }
  stdout.write(`\n${style(defaultTheme.muted, `file: ${keyPath()}`)}\n`);
  return 0;
}

export const keysSubcommand: Subcommand = {
  name: 'keys',
  description: 'Manage BYOK API keys at ~/.dirgha/keys.json',
  async run(argv): Promise<number> {
    const [op, envVar, value] = argv;
    if (!op || op === 'list') return runList();

    if (op === 'set') {
      if (!envVar || !value) { stderr.write(`${usage()}\n`); return 1; }
      const store = await read();
      store[envVar] = value;
      await write(store);
      stdout.write(`${style(defaultTheme.success, '✓')} stored ${envVar} (${mask(value)})\n`);
      return 0;
    }

    if (op === 'get') {
      if (!envVar) { stderr.write(`${usage()}\n`); return 1; }
      const store = await read();
      const v = store[envVar] ?? process.env[envVar];
      if (!v) { stderr.write(`${envVar} is not set.\n`); return 1; }
      stdout.write(`${v}\n`);
      return 0;
    }

    if (op === 'clear') {
      if (!envVar) { stderr.write(`${usage()}\n`); return 1; }
      if (envVar === 'all') {
        await write({});
        stdout.write(`${style(defaultTheme.success, '✓')} cleared every stored key\n`);
        return 0;
      }
      const store = await read();
      if (!(envVar in store)) { stderr.write(`${envVar} is not set.\n`); return 1; }
      delete store[envVar];
      await write(store);
      stdout.write(`${style(defaultTheme.success, '✓')} cleared ${envVar}\n`);
      return 0;
    }

    stderr.write(`unknown subcommand "${op}"\n${usage()}\n`);
    return 1;
  },
};
