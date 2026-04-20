// SPDX-License-Identifier: BUSL-1.1
import { Command } from 'commander';
import chalk from 'chalk';
import { clearCredentials } from '../utils/credentials.js';

export function registerLogoutCommand(program: Command): void {
  program
    .command('logout')
    .description('Log out and clear local credentials')
    .action(() => {
      clearCredentials();
      console.log(chalk.green('✓ Logged out successfully'));
    });
}
