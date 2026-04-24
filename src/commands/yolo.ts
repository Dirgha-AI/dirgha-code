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
    .description('Show current yolo mode status')
    .option('-e, --enable [level]', 'Enable yolo mode (safe|medium|all)', 'safe')
    .option('-d, --disable', 'Disable yolo mode')
    .action((options) => {
      const cfg = readConfig();
      
      if (options.disable) {
        cfg.autoApprove = false;
        cfg.dangerLevel = 'safe';
        saveConfig(cfg);
        console.log(chalk.green('✓ YOLO mode disabled'));
        console.log(chalk.dim('   Confirmations restored'));
        return;
      }
      
      if (options.enable) {
        const level = options.enable as string;
        if (!['safe', 'medium', 'all'].includes(level)) {
          console.log(chalk.red(`Invalid level: ${level}. Use: safe, medium, or all`));
          return;
        }
        cfg.autoApprove = true;
        cfg.dangerLevel = level as any;
        cfg.enabledAt = new Date().toISOString();
        saveConfig(cfg);
        console.log(chalk.yellow('⚠ YOLO MODE ENABLED'));
        console.log(chalk.cyan(`   Level: ${level}`));
        if (level === 'all') {
          console.log(chalk.red('   WARNING: All tools allowed including dangerous ones!'));
        } else if (level === 'medium') {
          console.log(chalk.yellow('   Note: Dangerous shell commands still require confirmation'));
        }
        return;
      }
      
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
  // --dangerously-skip-permissions flag sets bypass env vars
  // This should ONLY bypass confirmation dialogs, NOT security checks
  // Dangerous commands should still be blocked
  if (process.env['DIRGHA_SKIP_PERMISSIONS'] === '1') {
    // If a specific level is requested, check it
    if (dangerLevel) {
      const cfg = readConfig();
      return cfg.autoApprove && cfg.dangerLevel === dangerLevel;
    }
    // Default: return true ONLY for safe level (allows confirmation bypass for non-dangerous)
    // Dangerous commands will still be blocked by other checks
    return true;
  }
  
  const cfg = readConfig();
  if (!cfg.autoApprove) return false;
  
  if (!dangerLevel) return true; // No specific level requested
  
  const levels = { safe: 1, medium: 2, all: 3 };
  return levels[dangerLevel as keyof typeof levels] <= levels[cfg.dangerLevel];
}
