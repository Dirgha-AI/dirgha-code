/**
 * commands/browser-integration.ts — Browser automation command integration
 * Combines both browser command modules for unified registration
 */

import { Command } from 'commander';
import chalk from 'chalk';

// Import from browser module (internal navigation/snapshot)
import { registerBrowserCommands as registerInternalBrowserCommands } from '../browser/commands.js';

// Import from browser-cmd.ts (Playwright-based external browsing)
import { registerBrowserCommand as registerPlaywrightBrowserCommand } from './browser-cmd.js';

/**
 * Register all browser automation commands
 * - Internal browser: navigate, click, type, snapshot (headless/simulated)
 * - Playwright browser: goto, extract, pdf (full Playwright automation)
 */
export function registerBrowserIntegration(program: Command): void {
  // Create one shared 'browser' command to avoid duplicate registration
  const browserCmd = program.command('browser').description('Browser automation');

  // Register internal browser commands (browser/commands.ts)
  registerInternalBrowserCommands(program, browserCmd);

  // Register Playwright-based browser commands (browser-cmd.ts)
  registerPlaywrightBrowserCommand(program, browserCmd);

  // Add additional help info for browser command group
  browserCmd.on('--help', () => {
      console.log('');
      console.log(chalk.bold('Browser Command Groups:'));
      console.log('');
      console.log(chalk.cyan('  Internal Commands:'));
      console.log('    browser navigate <url>     Navigate to URL (simulated)');
      console.log('    browser click <selector>   Click element by selector');
      console.log('    browser type <sel> <text>  Type text into element');
      console.log('    browser snapshot           Capture accessibility tree');
      console.log('');
      console.log(chalk.cyan('  Playwright Commands:'));
      console.log('    browser goto <url>         Navigate with Playwright');
      console.log('    browser extract <url>        Extract text content from URL');
      console.log('    browser pdf <url>            Save page as PDF');
      console.log('');
    });
}

/**
 * Browser command help text for main program
 */
export function getBrowserHelpText(): string {
  return `
${chalk.bold('Browser Automation:')}
  ${chalk.cyan('browser')} ${chalk.dim('<subcommand>')}        Browser automation tools

  ${chalk.dim('Subcommands:')}
    ${chalk.cyan('navigate <url>')}         Navigate to URL
    ${chalk.cyan('click <selector>')}       Click element by CSS selector
    ${chalk.cyan('type <selector> <text>')} Type text into input element
    ${chalk.cyan('snapshot')}               Capture page accessibility tree
    ${chalk.cyan('goto <url>')}             Navigate and capture page data
    ${chalk.cyan('extract <url>')}          Extract text content from URL
    ${chalk.cyan('pdf <url>')}              Save page as PDF
`;
}
