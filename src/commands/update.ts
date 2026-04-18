/**
 * commands/update.ts — `dirgha update`
 *
 * Checks npm for the latest version of @dirgha-ai/cli and self-updates.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { execCmd } from '../utils/safe-exec.js';

declare const __CLI_VERSION__: string;
const PKG = 'dirgha-cli';
const CURRENT: string = (typeof __CLI_VERSION__ !== 'undefined') ? __CLI_VERSION__ : '1.0.0';

export const updateCommand = new Command('update')
  .description('Check for updates and install the latest @dirgha-ai/cli')
  .option('--check', 'Only check for updates, do not install')
  .action(async (opts: { check?: boolean }) => {
    console.log(chalk.dim('\n  Checking for updates…'));

    let latest: string;
    try {      const raw = execCmd('npm', ['view', PKG, 'version', '--json']);
      latest = raw.replace(/"/g, '').trim();
    } catch {
      console.error(chalk.red('  ✗ Could not reach npm registry. Are you online?\n'));
      process.exit(1);
    }

    if (latest === CURRENT) {
      console.log(chalk.green(`  ✓ Already on latest (${CURRENT})\n`));
      return;
    }

    console.log(`  Current: ${chalk.dim(CURRENT)}  →  Latest: ${chalk.cyan(latest)}`);

    if (opts.check) {
      console.log(chalk.dim(`\n  Run: npm install -g ${PKG}@latest\n`));
      return;
    }

    console.log(chalk.dim(`\n  Installing ${PKG}@${latest}…\n`));
    try {
      // For npm install -g, execCmd may fail if it expects a string return or specific stdio.
      execCmd('npm', ['install', '-g', `${PKG}@latest`], { stdio: 'inherit' });
      console.log(chalk.green(`\n  ✓ Updated to ${latest}. Restart dirgha to use the new version.\n`));
    } catch {
      console.error(chalk.red(`\n  ✗ Update failed. Try manually: npm install -g ${PKG}@latest\n`));
      process.exit(1);
    }
  });
