/**
 * `dirgha login` — interactive device-code sign-in.
 *
 * Non-REPL variant of the `/login` slash command. Prints the user code
 * and verification URL to stdout, waits for the poll to complete, then
 * persists the token via `saveToken`. Returns POSIX exit codes.
 */

import { stdout } from 'node:process';
import {
  pollDeviceAuth,
  saveToken,
  startDeviceAuth,
} from '../../integrations/device-auth.js';
import { defaultTheme, style } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

function print(line: string): void {
  stdout.write(`${line}\n`);
}

function parseFlag(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === `--${name}` && i + 1 < argv.length) return argv[i + 1];
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  return undefined;
}

export async function runLogin(argv: string[]): Promise<number> {
  const apiBase = parseFlag(argv, 'api-base') ?? process.env.DIRGHA_API_BASE;

  print(style(defaultTheme.accent, '\ndirgha — device-code sign-in'));
  let start;
  try {
    start = await startDeviceAuth(apiBase);
  } catch (err) {
    print(style(defaultTheme.danger, `\n✗ device/start failed: ${err instanceof Error ? err.message : String(err)}`));
    return 2;
  }

  print('');
  print(`  1. Open: ${start.verifyUri}`);
  print(`  2. Enter code: ${style(defaultTheme.accent, start.userCode)}`);
  print('');
  print(`Waiting for authorization (expires in ~${Math.round(start.expiresIn / 60_000)} min)...`);

  try {
    const result = await pollDeviceAuth(start.deviceCode, apiBase, {
      intervalMs: start.interval,
      timeoutMs: start.expiresIn,
    });
    await saveToken(result.token, result.userId, result.email);
    print(style(defaultTheme.success, `\n✓ Signed in as ${result.email}`));
    return 0;
  } catch (err) {
    print(style(defaultTheme.danger, `\n✗ Login failed: ${err instanceof Error ? err.message : String(err)}`));
    return 1;
  }
}

export const loginSubcommand: Subcommand = {
  name: 'login',
  description: 'Sign in via device-code flow',
  async run(argv) { return runLogin(argv); },
};
