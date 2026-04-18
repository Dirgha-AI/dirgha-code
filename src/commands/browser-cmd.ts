/**
 * /browser command — Browser automation
 * Production-validated
 * Sprint 13: CLI Polish
 */
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';

export function registerBrowserCommand(program: Command, existingCmd?: Command): void {
  const browser = existingCmd ?? program.command('browser').description('Browser automation');

  browser
    .command('goto <url>')
    .description('Navigate to URL and capture page data')
    .option('-s, --screenshot', 'Take screenshot')
    .option('-f, --full', 'Full page screenshot')
    .action(async (url: string, options) => {
      console.log(chalk.dim(`Navigating to ${url}...`));
      
      const pw = await findPlaywright();
      if (!pw) {
        console.log(chalk.red('Playwright not found. Install: npm i -g playwright'));
        return;
      }

      const browser = await pw.chromium.launch({ headless: true });
      const page = await browser.newPage();
      
      await page.goto(url, { waitUntil: 'networkidle' });
      const title = await page.title();
      
      console.log(chalk.green('✓ Loaded'));
      console.log(chalk.dim(`  Title: ${title}`));
      
      if (options.screenshot) {
        const dir = path.join(os.homedir(), '.dirgha', 'screenshots');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `screenshot-${Date.now()}.png`);
        await page.screenshot({ 
          path: file, 
          fullPage: options.full 
        });
        console.log(chalk.dim(`  Screenshot: ${file}`));
      }

      await browser.close();
    });

  browser
    .command('extract <url>')
    .description('Extract text content from URL')
    .option('-c, --css <selector>', 'CSS selector to extract')
    .action(async (url: string, options) => {
      const pw = await findPlaywright();
      if (!pw) { console.log(chalk.red('Playwright not found')); return; }

      const browser = await pw.chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      let content: string;
      if (options.css) {
        content = await page.locator(options.css).innerText().catch(() => '');
      } else {
        content = await page.locator('body').innerText();
      }

      await browser.close();
      
      console.log(chalk.green('✓ Extracted'));
      console.log(chalk.dim(`  Length: ${content.length} chars`));
      console.log();
      console.log(content.slice(0, 2000));
      if (content.length > 2000) {
        console.log(chalk.dim(`\n... (${content.length - 2000} more chars)`));
      }
    });

  browser
    .command('pdf <url>')
    .description('Save page as PDF')
    .option('-o, --output <path>', 'Output path')
    .action(async (url: string, options) => {
      const pw = await findPlaywright();
      if (!pw) { console.log(chalk.red('Playwright not found')); return; }

      const out = options.output || `page-${Date.now()}.pdf`;
      const browser = await pw.chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.pdf({ path: out, format: 'A4' });
      await browser.close();
      
      console.log(chalk.green('✓ PDF saved'));
      console.log(chalk.dim(`  → ${path.resolve(out)}`));
    });
}

async function findPlaywright(): Promise<any | null> {
  try {
    // @ts-ignore - optional dependency
    return await import('playwright-core');
  } catch {
    try {
      // @ts-ignore - optional dependency
      return await import('playwright');
    } catch {
      return null;
    }
  }
}
