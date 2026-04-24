
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { execCmd } from '../utils/safe-exec.js';
import { 
  readGlobalConfig, 
  writeGlobalConfig, 
  createDefaultConfig,
  isProjectInitialized,
  readProjectConfig,
  writeProjectConfig
} from '../utils/config.js';
import { isLoggedIn, readCredentials } from '../utils/credentials.js';
import { loginCommand } from './login.js';
import { readProfile } from '../utils/profile.js';
import { writeSoul, getSoulPath } from '../utils/soul.js';
import type { ProjectConfig, ThemeName } from '../types.js';

export async function setupCommand(): Promise<void> {
  console.log(chalk.bold.cyan('\n  Dirgha Setup Wizard\n'));
  console.log(chalk.dim('  This will help you configure your account, preferences, and platforms.\n'));

  // 1. Account Setup
  await sectionAccount();

  // 2. Preferences (Model, Provider, Theme)
  await sectionPreferences();

  // 3. Platforms (WhatsApp, Telegram)
  await sectionPlatforms();

  console.log(chalk.green('\n  ✓ Setup complete!'));
  console.log(chalk.dim('  You can run `dirgha setup` anytime to change these settings.\n'));
}

async function sectionAccount() {
  console.log(chalk.bold('  1. Account Setup'));
  
  if (isLoggedIn()) {
    const creds = readCredentials();
    const profile = readProfile();
    console.log(chalk.green(`     ✓ Logged in as ${creds?.email}`));
    if (profile?.tier) {
      console.log(chalk.dim(`     Plan: ${profile.tier}`));
    }
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Account actions:',
        choices: [
          { name: 'Keep current account', value: 'keep' },
          { name: 'Switch account / Login again', value: 'login' },
        ]
      }
    ]);
    
    if (action === 'login') {
      await loginCommand();
    }
  } else {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'You are not logged in. What would you like to do?',
        choices: [
          { name: 'Login with existing Dirgha account', value: 'login' },
          { name: 'Sign up for a new account', value: 'signup' },
          { name: 'Continue without account (BYOK mode)', value: 'skip' },
        ]
      }
    ]);

    if (action === 'login') {
      await loginCommand();
    } else if (action === 'signup') {
      const signupUrl = 'https://dirgha.ai/signup';
      console.log(chalk.cyan(`\n     Opening ${signupUrl} in your browser...\n`));
      try {
        if (process.platform === 'darwin') {
          execCmd('open', [signupUrl]);
        } else if (process.platform === 'win32') {
          execCmd('cmd.exe', ['/c', 'start', '""', signupUrl]);
        } else {
          execCmd('xdg-open', [signupUrl]);
        }
      } catch {}
      console.log(chalk.yellow('     After signing up, please return here and run `dirgha login`.\n'));
    }
  }
  console.log();
}

async function sectionPreferences() {
  console.log(chalk.bold('  2. Preferences'));
  
  const current = readGlobalConfig() || createDefaultConfig();
  
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Default AI Provider:',
      default: current.preferences?.defaultProvider || 'gateway',
      choices: ['gateway', 'anthropic', 'openrouter', 'nvidia']
    },
    {
      type: 'list',
      name: 'theme',
      message: 'CLI Theme:',
      default: current.preferences?.theme || 'default',
      choices: ['default', 'midnight', 'ocean', 'matrix', 'warm']
    },
    {
      type: 'list',
      name: 'reasoning',
      message: 'Default Reasoning Effort (Claude/O1):',
      default: current.preferences?.reasoningEffort || 'medium',
      choices: ['low', 'medium', 'high']
    },
    {
      type: 'list',
      name: 'soul',
      message: 'Agent Soul (Persona):',
      default: current.preferences?.soul || 'Architect',
      choices: [
        { name: 'Architect (Balanced, deep planning)', value: 'Architect' },
        { name: 'Cowboy (Fast, direct code)', value: 'Cowboy' },
        { name: 'Security (Audit-first, paranoid)', value: 'Security' },
        { name: 'Hacker (Creative, unconventional solutions)', value: 'Hacker' },
        { name: 'Pedant (Strict typing, verbose documentation)', value: 'Pedant' }
      ]
    },
    {
      type: 'input',
      name: 'language',
      message: 'Preferred Language (ISO code):',
      default: current.preferences?.language || 'en'
    }
  ]);

  const updated: Partial<ProjectConfig> = {
    ...current,
    preferences: {
      ...current.preferences!,
      defaultProvider: answers.provider,
      theme: answers.theme as ThemeName,
      language: answers.language,
      reasoningEffort: answers.reasoning,
      soul: answers.soul
    }
  };

  writeGlobalConfig(updated);
  writeSoul(answers.soul);
  console.log(chalk.green('     ✓ Preferences saved to ~/.dirgha/config.json'));
  console.log(chalk.green(`     ✓ Soul written to ${getSoulPath()}`));
  console.log(chalk.dim(`       Edit it anytime to shape how the agent thinks and communicates.\n`));
}

async function sectionPlatforms() {
  console.log(chalk.bold('  3. Platforms & Notifications'));
  
  const current = readGlobalConfig() || createDefaultConfig();
  const platforms = current.platforms || {};

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Enable messaging platforms:',
      choices: [
        { name: 'WhatsApp', value: 'whatsapp', checked: !!platforms.whatsapp?.enabled },
        { name: 'Telegram', value: 'telegram', checked: !!platforms.telegram?.enabled },
        { name: 'Discord', value: 'discord', checked: !!platforms.discord?.enabled },
        { name: 'Slack', value: 'slack', checked: !!platforms.slack?.enabled },
        { name: 'Webhook', value: 'webhook', checked: !!platforms.webhook?.enabled },
      ]
    }
  ]);

  const updatedPlatforms: any = { ...platforms };

  // WhatsApp
  if (selected.includes('whatsapp')) {
    console.log(chalk.cyan('\n     [WhatsApp Setup]'));
    const ws = await inquirer.prompt([{
      type: 'input', name: 'phone', message: 'Enter your phone number (with country code):',
      default: platforms.whatsapp?.phoneNumber
    }]);
    updatedPlatforms.whatsapp = { enabled: true, phoneNumber: ws.phone, paired: platforms.whatsapp?.paired || false };
  } else { updatedPlatforms.whatsapp = { enabled: false }; }

  // Telegram
  if (selected.includes('telegram')) {
    console.log(chalk.cyan('\n     [Telegram Setup]'));
    const ts = await inquirer.prompt([{
      type: 'input', name: 'token', message: 'Enter your Telegram Bot Token:',
      default: platforms.telegram?.botToken
    }]);
    updatedPlatforms.telegram = { enabled: true, botToken: ts.token };
  } else { updatedPlatforms.telegram = { enabled: false }; }

  // Discord
  if (selected.includes('discord')) {
    console.log(chalk.cyan('\n     [Discord Setup]'));
    const ds = await inquirer.prompt([
      { type: 'input', name: 'token', message: 'Enter your Discord Bot Token:', default: platforms.discord?.botToken },
      { type: 'input', name: 'appId', message: 'Enter your Discord Application ID:', default: platforms.discord?.applicationId }
    ]);
    updatedPlatforms.discord = { enabled: true, botToken: ds.token, applicationId: ds.appId };
  } else { updatedPlatforms.discord = { enabled: false }; }

  // Slack
  if (selected.includes('slack')) {
    console.log(chalk.cyan('\n     [Slack Setup]'));
    const ss = await inquirer.prompt([
      { type: 'input', name: 'botToken', message: 'Enter your Slack Bot User OAuth Token (xoxb-...):', default: platforms.slack?.botToken },
      { type: 'input', name: 'appToken', message: 'Enter your Slack App-Level Token (xapp-...):', default: platforms.slack?.appToken },
      { type: 'input', name: 'secret', message: 'Enter your Slack Signing Secret:', default: platforms.slack?.signingSecret }
    ]);
    updatedPlatforms.slack = { enabled: true, botToken: ss.botToken, appToken: ss.appToken, signingSecret: ss.secret };
  } else { updatedPlatforms.slack = { enabled: false }; }

  // Webhook
  if (selected.includes('webhook')) {
    console.log(chalk.cyan('\n     [Webhook Setup]'));
    const wh = await inquirer.prompt([
      { type: 'input', name: 'url', message: 'Enter your Webhook URL:', default: platforms.webhook?.url },
      { type: 'input', name: 'secret', message: 'Enter your Webhook Secret (optional):', default: platforms.webhook?.secret }
    ]);
    updatedPlatforms.webhook = { enabled: true, url: wh.url, secret: wh.secret };
  } else { updatedPlatforms.webhook = { enabled: false }; }

  const updated: Partial<ProjectConfig> = {
    ...current,
    platforms: updatedPlatforms
  };

  writeGlobalConfig(updated);
  console.log(chalk.green('\n     ✓ Platform settings updated.\n'));
}
