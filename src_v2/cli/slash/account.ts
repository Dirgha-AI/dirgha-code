/**
 * /account — show billing + quota. Reads a cached whoami from
 * ~/.dirgha/auth.json if it exists, otherwise falls back to a
 * "not signed in" hint. Full billing integration depends on
 * integrations/auth.ts + entitlements.ts, neither of which is wired
 * to an authenticated client in the REPL. STUB.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SlashCommand } from './types.js';

interface CachedAuth {
  userId?: string;
  scope?: string[];
  expiresAt?: string;
  tier?: string;
}

async function readAuth(): Promise<CachedAuth | undefined> {
  const path = join(homedir(), '.dirgha', 'auth.json');
  const text = await readFile(path, 'utf8').catch(() => '');
  if (!text) return undefined;
  try { return JSON.parse(text) as CachedAuth; } catch { return undefined; }
}

export const accountCommand: SlashCommand = {
  name: 'account',
  description: 'Show billing tier, scope, and quota',
  async execute(_args, ctx) {
    const auth = await readAuth();
    if (!auth || !auth.userId) {
      return [
        'Not signed in.',
        '',
        'Sign in with `dirgha auth login`, or run dirgha with BYOK keys',
        '(see `/keys` or `/setup`).',
        '',
        `Current model: ${ctx.model}`,
        `Current usage: ${ctx.showCost()}`,
      ].join('\n');
    }
    return [
      'Account:',
      `  user      : ${auth.userId}`,
      `  tier      : ${auth.tier ?? 'unknown (quota check not yet wired)'}`,
      `  scope     : ${(auth.scope ?? []).join(', ') || '(none)'}`,
      `  expires   : ${auth.expiresAt ?? 'unknown'}`,
      '',
      `  model     : ${ctx.model}`,
      `  usage     : ${ctx.showCost()}`,
      '',
      '(Full billing detail lives at https://dirgha.ai/app/account. STUB.)',
    ].join('\n');
  },
};
