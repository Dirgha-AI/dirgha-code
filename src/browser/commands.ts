/**
 * browser/commands.ts — Dirgha Browser CLI commands
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { launchBrowser, findBrowserExecutable, isBrowserRunning, killBrowser } from './launcher.js';
import { ipcClient } from './ipc-client.js';

export function registerBrowserCommands(program: Command, existingCmd?: Command): void {
  const browser = existingCmd ?? program.command('browser').description('Dirgha Browser control');

  browser
    .command('launch')
    .description('Launch Dirgha Browser')
    .option('--headless', 'Run headless')
    .option('--dev', 'Development mode')
    .action(async (opts) => {
      const exe = findBrowserExecutable();
      if (!exe) { console.log(chalk.red('✗ Dirgha Browser not found')); return; }
      console.log(chalk.dim('Launching browser...'));
      await launchBrowser({ headless: opts.headless, dev: opts.dev });
      console.log(chalk.green('✓ Browser launched'));
    });

  browser
    .command('navigate <url>')
    .description('Navigate to URL')
    .action(async (url: string) => {
      if (!ipcClient.isConnected()) await ipcClient.connect();
      const res = await ipcClient.sendCommand('NAVIGATE', { url });
      console.log(res.success ? chalk.green(`✓ Navigated to ${url}`) : chalk.red(`✗ ${res.error}`));
    });

  browser
    .command('clip')
    .description('Clip current page')
    .action(async () => {
      if (!ipcClient.isConnected()) await ipcClient.connect();
      const res = await ipcClient.sendCommand('CLIP');
      console.log(res.success ? chalk.green('✓ Page clipped') : chalk.red(`✗ ${res.error}`));
      if (res.data) console.log(chalk.dim(String(res.data).slice(0, 500)));
    });

  browser
    .command('chat [message]')
    .description('Chat about current page')
    .action(async (msg?: string) => {
      if (!ipcClient.isConnected()) await ipcClient.connect();
      const res = await ipcClient.sendCommand('CHAT', { message: msg || '' });
      console.log(res.success ? chalk.blue('🤖 ' + String(res.data)) : chalk.red(`✗ ${res.error}`));
    });

  browser
    .command('url')
    .description('Get current URL')
    .action(async () => {
      if (!ipcClient.isConnected()) await ipcClient.connect();
      const res = await ipcClient.sendCommand('GET_URL');
      console.log(res.success ? chalk.cyan(String(res.data)) : chalk.red(`✗ ${res.error}`));
    });

  browser
    .command('title')
    .description('Get page title')
    .action(async () => {
      if (!ipcClient.isConnected()) await ipcClient.connect();
      const res = await ipcClient.sendCommand('GET_TITLE');
      console.log(res.success ? chalk.cyan(String(res.data)) : chalk.red(`✗ ${res.error}`));
    });

  browser
    .command('kill')
    .description('Stop browser')
    .action(() => {
      ipcClient.disconnect();
      killBrowser() ? console.log(chalk.green('✓ Browser stopped')) : console.log(chalk.yellow('Browser not running'));
    });

  browser
    .command('status')
    .description('Check browser status')
    .action(() => {
      console.log(isBrowserRunning() ? chalk.green('● Running') : chalk.gray('○ Not running'));
    });
}
