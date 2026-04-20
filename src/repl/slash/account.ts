/**
 * repl/slash/account.ts — /account and /upgrade slash commands.
 *
 * /account   — show account info, quota, plan; hints for /switch, /logout
 * /upgrade   — open dirgha.ai/pricing in the browser
 */
import chalk from 'chalk';
import type { SlashCommand } from './types.js';
import { readCredentials, isLoggedIn } from '../../utils/credentials.js';
import { execCmd } from '../../utils/safe-exec.js';

function openUrl(url: string): void {
  const platform = process.platform;
  try {
    if (platform === 'darwin') execCmd('open', [url]);
    else if (platform === 'win32') execCmd('cmd', ['/c', 'start', url]);
    else execCmd('xdg-open', [url]);
  } catch { /* non-TTY env */ }
}

const accountCommand: SlashCommand = {
  name: 'account',
  description: 'Show account info + plan + quota',
  category: 'session',
  aliases: ['me', 'whoami'],
  handler: () => {
    const creds = readCredentials();
    if (!creds || !isLoggedIn()) {
      return [
        chalk.yellow('  Not signed in.'),
        '',
        chalk.dim('  Sign up:  ') + chalk.cyan('/signup') + chalk.dim('   (free · 100k tokens/day)'),
        chalk.dim('  Sign in:  ') + chalk.cyan('/login') + chalk.dim('    (existing account)'),
        chalk.dim('  BYOK:     ') + chalk.cyan('/keys') + chalk.dim('     (bring a provider key)'),
        '',
      ].join('\n');
    }
    return [
      '',
      '  ' + chalk.bold('Account'),
      '  ' + chalk.dim('Email    ') + chalk.cyan(creds.email),
      '  ' + chalk.dim('User ID  ') + chalk.dim(creds.userId),
      '  ' + chalk.dim('Expires  ') + chalk.dim(new Date(creds.expiresAt).toLocaleDateString()),
      '',
      '  ' + chalk.dim('Commands:'),
      '  ' + chalk.dim('  /upgrade  ') + chalk.dim('open dirgha.ai/pricing'),
      '  ' + chalk.dim('  /logout   ') + chalk.dim('clear credentials'),
      '  ' + chalk.dim('  /status   ') + chalk.dim('full quota + sessions'),
      '',
    ].join('\n');
  },
};

const upgradeCommand: SlashCommand = {
  name: 'upgrade',
  description: 'Open Dirgha pricing page',
  category: 'session',
  handler: () => {
    const url = 'https://dirgha.ai/pricing?source=cli';
    openUrl(url);
    return [
      '',
      '  ' + chalk.cyan('Opening ') + chalk.underline(url),
      '  ' + chalk.dim('(if your browser does not open, copy the URL above)'),
      '',
    ].join('\n');
  },
};

export const accountCommands: SlashCommand[] = [accountCommand, upgradeCommand];
