/**
 * /yolo command — Auto-approve mode toggle
 * Production-validated
 * Sprint 13: CLI Polish
 */
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface YoloConfig {
  autoApprove: boolean;
  dangerLevel: 'safe' | 'medium' | 'all';
  enabledAt?: string;
}

const CONFIG_PATH = path.join(os.homedir(), '.dirgha', 'yolo.json');

function readConfig(): YoloConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { autoApprove: false, dangerLevel: 'safe' };
  }
}

function saveConfig(cfg: YoloConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

export function registerYoloCommand(program: Command): void {
  program
    .command('yolo')
    .description('Toggle auto-approve mode (skip confirmations)')
    .option('-e, --enable', 'Enable auto-approve')
    .option('-d, --disable', 'Disable auto-approve')
    .option('-l, --level <level>', 'Danger level: safe|medium|all', 'safe')
    .option('-s, --status', 'Show current status')
    .action((options) => {
      const cfg = readConfig();

      if (options.status) {
        showStatus(cfg);
        return;
      }

      if (options.enable) {
        cfg.autoApprove = true;
        cfg.dangerLevel = options.level as any;
        cfg.enabledAt = new Date().toISOString();
        saveConfig(cfg);
        console.log(chalk.yellow('⚡ YOLO MODE ENABLED'));
        console.log(chalk.dim(`   Auto-approving: ${cfg.dangerLevel}`));
        console.log(chalk.red('   Use with caution!'));
        return;
      }

      if (options.disable) {
        cfg.autoApprove = false;
        saveConfig(cfg);
        console.log(chalk.green('✓ YOLO mode disabled'));
        console.log(chalk.dim('   Confirmations restored'));
        return;
      }

      // Toggle
      cfg.autoApprove = !cfg.autoApprove;
      if (cfg.autoApprove) {
        cfg.dangerLevel = options.level as any;
        cfg.enabledAt = new Date().toISOString();
      }
      saveConfig(cfg);

      showStatus(cfg);
    });
}

function showStatus(cfg: YoloConfig): void {
  console.log(chalk.bold('YOLO Mode'));
  console.log(`  Status: ${cfg.autoApprove ? chalk.yellow('⚡ ENABLED') : chalk.green('disabled')}`);
  console.log(`  Level:  ${chalk.cyan(cfg.dangerLevel)}`);
  if (cfg.enabledAt) {
    const ago = Math.floor((Date.now() - new Date(cfg.enabledAt).getTime()) / 60000);
    console.log(`  Since:  ${chalk.dim(ago < 1 ? 'just now' : `${ago}m ago`)}`);
  }
}

export function isYoloEnabled(dangerLevel?: string): boolean {
  // --dangerously-skip-permissions flag sets this env var at startup
  if (process.env['DIRGHA_YOLO'] === '1') return true;
  const cfg = readConfig();
  if (!cfg.autoApprove) return false;
  if (!dangerLevel) return true;

  const levels = { safe: 1, medium: 2, all: 3 };
  return levels[dangerLevel as keyof typeof levels] <= levels[cfg.dangerLevel];
}
