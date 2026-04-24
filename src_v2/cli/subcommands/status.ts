/**
 * `dirgha status` — snapshot of the CLI state.
 *
 * Reports:
 *   - whether the user is logged in (via device-auth credentials)
 *   - current default model + configured providers
 *   - session store location + count
 *   - quota summary when logged in (best-effort; silent on error)
 *
 * Mirrors the REPL `/status` slash but is scoped to globals rather
 * than a live session.
 */

import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdout } from 'node:process';
import { loadConfig } from '../config.js';
import { loadToken } from '../../integrations/device-auth.js';
import { createEntitlementsClient } from '../../integrations/entitlements.js';
import type { Entitlements } from '../../integrations/entitlements.js';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

const PROVIDER_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
};

async function sessionCount(): Promise<number> {
  const dir = join(homedir(), '.dirgha', 'sessions');
  const files = await readdir(dir).catch(() => [] as string[]);
  return files.filter(f => f.endsWith('.jsonl')).length;
}

async function entitlementsFor(token: string): Promise<Entitlements | undefined> {
  try {
    const client = createEntitlementsClient();
    return await client.get(token);
  } catch {
    return undefined;
  }
}

export const statusSubcommand: Subcommand = {
  name: 'status',
  description: 'Show current config, model, providers, and login state',
  async run(argv, ctx): Promise<number> {
    const json = argv.includes('--json');
    const config = await loadConfig(ctx.cwd);
    const token = await loadToken();
    const sessions = await sessionCount();
    const providers: Record<string, boolean> = {};
    for (const [name, env] of Object.entries(PROVIDER_ENV)) {
      providers[name] = Boolean(process.env[env]);
    }

    const entitlements = token ? await entitlementsFor(token.token) : undefined;

    if (json) {
      const payload = {
        loggedIn: Boolean(token),
        user: token ? { userId: token.userId, email: token.email, expiresAt: token.expiresAt } : undefined,
        model: config.model,
        maxTurns: config.maxTurns,
        sessions,
        providers,
        entitlements,
      };
      stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      return 0;
    }

    stdout.write(`\n${style(defaultTheme.accent, 'Dirgha status')}\n\n`);
    stdout.write(`  ${'account'.padEnd(14)} ${token ? style(defaultTheme.success, `${token.email ?? token.userId}`) : style(defaultTheme.muted, 'not logged in')}\n`);
    if (token) stdout.write(`  ${'expires'.padEnd(14)} ${style(defaultTheme.muted, token.expiresAt)}\n`);
    stdout.write(`  ${'model'.padEnd(14)} ${config.model}\n`);
    stdout.write(`  ${'max turns'.padEnd(14)} ${config.maxTurns}\n`);
    stdout.write(`  ${'sessions'.padEnd(14)} ${sessions} saved\n`);

    stdout.write(`\n${style(defaultTheme.userPrompt, 'providers')}\n`);
    for (const [name, hasKey] of Object.entries(providers)) {
      const marker = hasKey ? style(defaultTheme.success, 'configured') : style(defaultTheme.muted, 'unset');
      stdout.write(`  ${name.padEnd(14)} ${marker}\n`);
    }

    if (entitlements) {
      stdout.write(`\n${style(defaultTheme.userPrompt, 'plan')}\n`);
      stdout.write(`  ${'tier'.padEnd(14)} ${entitlements.tier}\n`);
      stdout.write(`  ${'daily deploys'.padEnd(14)} ${entitlements.limits.dailyDeploys}\n`);
      stdout.write(`  ${'subagents'.padEnd(14)} ${entitlements.limits.maxSubagents}\n`);
    }

    stdout.write('\n');
    return 0;
  },
};
