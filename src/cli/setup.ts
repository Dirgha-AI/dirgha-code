/**
 * First-run interactive setup wizard.
 *
 * Prompts the user for provider API keys (BYOK), picks a default
 * model, and persists the result to `~/.dirgha/config.json` plus a
 * sibling `~/.dirgha/env` file that exports the keys for future
 * invocations. The wizard never overwrites an existing non-empty value
 * without confirmation.
 */

import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import type { DirghaConfig } from './config.js';
import { DEFAULT_CONFIG } from './config.js';
import { style, defaultTheme } from '../tui/theme.js';

interface ProviderEntry {
  label: string;
  env: string;
  helpUrl: string;
  suggested: string[];
}

const PROVIDERS: ProviderEntry[] = [
  { label: 'NVIDIA NIM',  env: 'NVIDIA_API_KEY',     helpUrl: 'https://build.nvidia.com/settings/api-keys', suggested: ['moonshotai/kimi-k2-instruct', 'qwen/qwen3-next-80b-a3b-instruct', 'meta/llama-3.3-70b-instruct'] },
  { label: 'OpenRouter',  env: 'OPENROUTER_API_KEY', helpUrl: 'https://openrouter.ai/keys',                 suggested: ['tencent/hy3-preview:free', 'inclusionai/ling-2.6-1t:free', 'qwen/qwen3-coder:free', 'moonshotai/kimi-k2.6', 'deepseek/deepseek-v3.2-exp', 'google/gemini-3.1-pro-preview', 'z-ai/glm-5'] },
  { label: 'Anthropic',   env: 'ANTHROPIC_API_KEY',  helpUrl: 'https://console.anthropic.com/settings/keys', suggested: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'] },
  { label: 'OpenAI',      env: 'OPENAI_API_KEY',     helpUrl: 'https://platform.openai.com/api-keys',        suggested: ['gpt-5.5-pro', 'gpt-5.5', 'gpt-5', 'gpt-5-mini', 'gpt-4o-mini', 'o1'] },
  { label: 'Google AI',   env: 'GEMINI_API_KEY',     helpUrl: 'https://aistudio.google.com/apikey',          suggested: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
  { label: 'Mistral',     env: 'MISTRAL_API_KEY',    helpUrl: 'https://console.mistral.ai/api-keys',         suggested: ['mistral/mistral-large-latest', 'mistral/mistral-medium-latest', 'mistral/codestral-latest'] },
  { label: 'Cohere',      env: 'COHERE_API_KEY',     helpUrl: 'https://dashboard.cohere.com/api-keys',       suggested: ['cohere/command-a-03-2025', 'cohere/command-r-plus'] },
  { label: 'Cerebras',    env: 'CEREBRAS_API_KEY',   helpUrl: 'https://cloud.cerebras.ai/platform/keys',     suggested: ['cerebras/llama-3.3-70b', 'cerebras/qwen-3-32b'] },
  { label: 'Together AI', env: 'TOGETHER_API_KEY',   helpUrl: 'https://api.together.ai/settings/api-keys',   suggested: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-Coder-32B-Instruct'] },
  { label: 'Perplexity',  env: 'PERPLEXITY_API_KEY', helpUrl: 'https://www.perplexity.ai/settings/api',      suggested: ['perplexity/sonar', 'perplexity/sonar-pro'] },
  { label: 'xAI (Grok)',  env: 'XAI_API_KEY',        helpUrl: 'https://console.x.ai/team/api-keys',          suggested: ['grok-4-fast', 'grok-4'] },
  { label: 'Groq',        env: 'GROQ_API_KEY',       helpUrl: 'https://console.groq.com/keys',               suggested: ['groq/llama-3.3-70b-versatile', 'groq/qwen-3-32b'] },
  { label: 'Z.AI / GLM',  env: 'ZAI_API_KEY',        helpUrl: 'https://docs.z.ai/devpack/tool/openai',       suggested: ['zai/glm-4.6', 'zai/glm-4.5-air'] },
];

export interface SetupOptions {
  home?: string;
}

export async function runSetup(opts: SetupOptions = {}): Promise<void> {
  const home = opts.home ?? homedir();
  const dir = join(home, '.dirgha');
  const configPath = join(dir, 'config.json');
  const envPath = join(dir, 'env');
  await mkdir(dir, { recursive: true });

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question: string, defaultValue?: string): Promise<string> => new Promise(resolve => {
    const suffix = defaultValue !== undefined && defaultValue.length > 0 ? ` [${maskIfSecret(defaultValue)}]` : '';
    rl.question(`${question}${suffix}: `, answer => resolve(answer.trim() || defaultValue || ''));
  });

  print(`\n${style(defaultTheme.accent, 'dirgha-cli setup')}  —  bring your own keys + pick a default model.\n`);
  print(`Config file: ${configPath}`);
  print(`Env  file:  ${envPath}\n`);

  const existing = await readJson(configPath);
  const existingEnv = await readEnvFile(envPath);
  const collectedKeys: Record<string, string> = { ...existingEnv };

  for (const provider of PROVIDERS) {
    const current = existingEnv[provider.env] ?? process.env[provider.env] ?? '';
    print(style(defaultTheme.userPrompt, `\n${provider.label}`) + style(defaultTheme.muted, `   (${provider.helpUrl})`));
    const answer = await ask(`  ${provider.env}`, current);
    if (answer) collectedKeys[provider.env] = answer;
  }

  print('\nChoose a default model.');
  const suggestions = PROVIDERS.flatMap(p => p.suggested);
  suggestions.forEach((m, i) => { print(`  ${i + 1}. ${m}`); });
  const selection = await ask('  choose by number or paste a model id', existing.model ?? DEFAULT_CONFIG.model);
  const defaultModel = resolveModel(selection, suggestions, existing.model ?? DEFAULT_CONFIG.model);

  const showThinkingAns = (await ask('\n  Show model thinking when available? (y/N)', existing.showThinking ? 'y' : 'n')).toLowerCase();
  const showThinking = showThinkingAns === 'y' || showThinkingAns === 'yes';

  rl.close();

  const config: Partial<DirghaConfig> = {
    ...existing,
    model: defaultModel,
    showThinking,
  };
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  await writeEnvFile(envPath, collectedKeys);
  try { await chmod(envPath, 0o600); } catch { /* non-POSIX fs */ }

  print(style(defaultTheme.success, '\nSetup complete.'));
  print('\nTo load keys into your shell, add to ~/.bashrc or ~/.zshrc:');
  print(`  ${style(defaultTheme.muted, `set -a && source ${envPath} && set +a`)}`);
  print(`Or run dirgha from a shell that already has those env vars exported.`);
  print(`\nDefault model: ${style(defaultTheme.accent, defaultModel)}  (change with /model inside the REPL or --model on the command line)`);
}

function resolveModel(selection: string, suggestions: string[], fallback: string): string {
  if (/^\d+$/.test(selection)) {
    const idx = Number.parseInt(selection, 10) - 1;
    if (idx >= 0 && idx < suggestions.length) return suggestions[idx];
  }
  return selection || fallback;
}

async function readJson(path: string): Promise<Partial<DirghaConfig>> {
  const text = await readFile(path, 'utf8').catch(() => '');
  if (!text) return {};
  try { return JSON.parse(text) as Partial<DirghaConfig>; } catch { return {}; }
}

async function readEnvFile(path: string): Promise<Record<string, string>> {
  const text = await readFile(path, 'utf8').catch(() => '');
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    out[m[1]] = value;
  }
  return out;
}

async function writeEnvFile(path: string, values: Record<string, string>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const lines = Object.entries(values)
    .filter(([, value]) => value)
    .map(([key, value]) => `export ${key}=${quoteValue(value)}`);
  await writeFile(path, lines.join('\n') + '\n', 'utf8');
}

function quoteValue(value: string): string {
  if (/^[A-Za-z0-9_\-./:]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function maskIfSecret(value: string): string {
  if (value.length < 10) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function print(line: string): void {
  process.stdout.write(line + '\n');
}

void stat;
