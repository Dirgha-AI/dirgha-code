/**
 * setup/localAIPrompt.ts — One-time first-run prompt to enable local AI.
 * Called on REPL startup when config.localAI is null.
 */
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import readline from 'readline';

const CONFIG_PATH = path.join(os.homedir(), '.dirgha', 'config.json');

function readConfig(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(cfg: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

function isLlamaServerAvailable(): boolean {
  try {
    execSync('which llama-server', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function triggerDownload(): void {
  const adminToken = process.env['ADMIN_TOKEN'] ?? '';
  fetch('http://localhost:3001/api/inference/download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken,
    },
    body: JSON.stringify({ model: 'gemma-3-1b-it-Q4_K_M' }),
  }).catch(() => { /* fire-and-forget */ });
}

export async function maybePromptLocalAI(): Promise<void> {
  const cfg = readConfig();

  // Already decided — never prompt again
  if (cfg.localAI === 'enabled' || cfg.localAI === 'declined') return;

  // Can't offer what we can't deliver
  if (!isLlamaServerAvailable()) return;

  const border = chalk.hex('#5B21B6');
  const brand  = chalk.hex('#A78BFA');
  const dim    = chalk.dim;

  console.log('');
  console.log(border('  ┌─────────────────────────────────────────────────────┐'));
  console.log(border('  │') + brand('  ◆ Local AI available                               ') + border('│'));
  console.log(border('  │') + chalk.white('  Run Gemma 3 1B locally — private, free, offline    ') + border('│'));
  console.log(border('  │') + chalk.hex('#E5E7EB')('  Download ~800MB once? ') + chalk.green('[Y') + chalk.hex('#E5E7EB')('/') + dim('n') + chalk.hex('#E5E7EB')(']                        ') + border('│'));
  console.log(border('  └─────────────────────────────────────────────────────┘'));
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const answer = await new Promise<string>(resolve => {
    rl.question(chalk.hex('#A78BFA')('  > '), ans => {
      rl.close();
      resolve(ans.trim());
    });
  });

  console.log('');

  if (answer === '' || answer === 'y' || answer === 'Y') {
    console.log(chalk.hex('#A78BFA')('  ◆ Starting download... this runs in background via the gateway.'));
    triggerDownload();
    cfg.localAI = 'enabled';
    writeConfig(cfg);
    console.log(chalk.dim('  ◆ Download started. Run /local to check status.'));
  } else {
    cfg.localAI = 'declined';
    writeConfig(cfg);
    console.log(chalk.dim('  ◆ Got it. Using cloud models. Run /local to change later.'));
  }

  console.log('');
}
