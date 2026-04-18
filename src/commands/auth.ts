import chalk from 'chalk';
import inquirer from 'inquirer';
import type { ProjectConfig } from '../types.js';
import { getActiveProvider } from '../providers/index.js';
import { readGlobalConfig, writeGlobalConfig } from '../utils/config.js';
import { setKey, readKeys } from '../utils/keys.js';

// ---------------------------------------------------------------------------
// Key storage — writes to ~/.dirgha/keys.json (persistent, loaded at startup)
// ---------------------------------------------------------------------------

function writeEnvVar(key: string, value: string): void {
  setKey(key, value);
  process.env[key] = value; // apply immediately in current process
}

function alreadySet(key: string): boolean {
  return !!(process.env[key] || readKeys()[key]);
}

// ---------------------------------------------------------------------------
// Persist chosen provider to global config
// ---------------------------------------------------------------------------

function saveProviderToGlobalConfig(
  provider: 'litellm' | 'anthropic' | 'openrouter' | 'nvidia' | 'gateway',
): void {
  const existing = readGlobalConfig() ?? {};
  const existingPrefs = (existing.preferences ?? {}) as Partial<ProjectConfig['preferences']>;
  const merged = {
    ...existing,
    preferences: {
      defaultModel: existingPrefs.defaultModel ?? 'nemotron-3-nano-4b',
      autoApply: existingPrefs.autoApply ?? false,
      verbose: existingPrefs.verbose ?? false,
      defaultProvider: provider,
    },
  };
  writeGlobalConfig(merged);
}

// ---------------------------------------------------------------------------
// Sub-flows
// ---------------------------------------------------------------------------

async function setupLiteLLM(): Promise<void> {
  const { vpsUrl } = await inquirer.prompt<{ vpsUrl: string }>([
    {
      type: 'input',
      name: 'vpsUrl',
      message: 'VPS / LiteLLM base URL (e.g. http://31.97.239.223:4000):',
      validate: (v: string) => v.trim().length > 0 || 'URL is required',
    },
  ]);

  const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
    {
      type: 'password',
      name: 'apiKey',
      message: 'API key (leave blank if none):',
      mask: '*',
    },
  ]);

  writeEnvVar('LITELLM_BASE_URL', vpsUrl.trim());
  if (apiKey.trim()) writeEnvVar('LITELLM_API_KEY', apiKey.trim());

  saveProviderToGlobalConfig('litellm');
  console.log(chalk.green('✔ VPS / LiteLLM configured'));
}

async function setupAnthropic(): Promise<void> {
  const existing = alreadySet('ANTHROPIC_API_KEY');
  if (existing) {
    const masked = (process.env['ANTHROPIC_API_KEY'] ?? '***').slice(0, 8) + '...';
    console.log(chalk.dim(`  Current: ${masked}`));
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([{ type: 'confirm', name: 'overwrite', message: 'Key already set. Overwrite?', default: false }]);
    if (!overwrite) { console.log(chalk.dim('Kept existing key.')); return; }
  }
  const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
    { type: 'password', name: 'apiKey', message: 'Anthropic API key (sk-ant-...):', mask: '*', validate: (v: string) => v.trim().length > 0 || 'API key is required' },
  ]);
  writeEnvVar('ANTHROPIC_API_KEY', apiKey.trim());
  saveProviderToGlobalConfig('anthropic');
  console.log(chalk.green('✔ Anthropic API key saved to ~/.dirgha/keys.json'));
}

async function setupOpenRouter(): Promise<void> {
  const existing = alreadySet('OPENROUTER_API_KEY');
  if (existing) {
    const masked = (process.env['OPENROUTER_API_KEY'] ?? '***').slice(0, 8) + '...';
    console.log(chalk.dim(`  Current: ${masked}`));
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([{ type: 'confirm', name: 'overwrite', message: 'Key already set. Overwrite?', default: false }]);
    if (!overwrite) { console.log(chalk.dim('Kept existing key.')); return; }
  }
  const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
    { type: 'password', name: 'apiKey', message: 'OpenRouter API key:', mask: '*', validate: (v: string) => v.trim().length > 0 || 'API key is required' },
  ]);
  writeEnvVar('OPENROUTER_API_KEY', apiKey.trim());
  saveProviderToGlobalConfig('openrouter');
  console.log(chalk.green('✔ OpenRouter API key saved to ~/.dirgha/keys.json'));
}

async function setupNvidia(): Promise<void> {
  const existing = alreadySet('NVIDIA_API_KEY');
  if (existing) {
    const masked = (process.env['NVIDIA_API_KEY'] ?? '***').slice(0, 8) + '...';
    console.log(chalk.dim(`  Current: ${masked}`));
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([{ type: 'confirm', name: 'overwrite', message: 'Key already set. Overwrite?', default: false }]);
    if (!overwrite) { console.log(chalk.dim('Kept existing key.')); return; }
  }
  const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
    { type: 'password', name: 'apiKey', message: 'NVIDIA NIM API key (from build.nvidia.com):', mask: '*', validate: (v: string) => v.trim().length > 0 || 'API key is required' },
  ]);
  writeEnvVar('NVIDIA_API_KEY', apiKey.trim());
  saveProviderToGlobalConfig('nvidia');
  console.log(chalk.green('✔ NVIDIA NIM API key saved to ~/.dirgha/keys.json'));
  console.log(chalk.dim('  Free models: meta/llama-3.3-70b-instruct, nvidia/llama-3.1-nemotron-70b-instruct'));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function authCommand(): Promise<void> {
  const current = getActiveProvider();
  console.log(chalk.dim(`Currently: ${current}`));
  console.log();

  type Choice = 'litellm' | 'anthropic' | 'openrouter' | 'nvidia' | 'skip';

  const { choice } = await inquirer.prompt<{ choice: Choice }>([
    {
      type: 'list',
      name: 'choice',
      message: 'Choose auth provider:',
      choices: [
        { name: 'Dirgha VPS / LiteLLM (recommended)', value: 'litellm' },
        { name: 'Anthropic API Key (Claude)', value: 'anthropic' },
        { name: 'NVIDIA NIM API Key (free tier — Llama, Nemotron)', value: 'nvidia' },
        { name: 'OpenRouter API Key', value: 'openrouter' },
        { name: 'Skip', value: 'skip' },
      ],
    },
  ]);

  switch (choice) {
    case 'litellm':    await setupLiteLLM();    break;
    case 'anthropic':  await setupAnthropic();  break;
    case 'nvidia':     await setupNvidia();     break;
    case 'openrouter': await setupOpenRouter(); break;
    case 'skip':
    default:
      console.log(chalk.dim('Skipped.'));
  }
}
