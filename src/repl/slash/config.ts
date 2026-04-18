// @ts-nocheck

/**
 * repl/slash/config.ts — Configuration and settings commands
 */
import chalk from 'chalk';
import { getTheme } from '../themes.js';
import { setTheme, THEMES, getActiveThemeName } from '../../tui/colors.js';
import { setKeybinding } from '../../tui/keybindings.js';
import type { SlashCommand, ReplContext } from './types.js';
import type { ThemeName } from '../../types.js';

export const configCommands: SlashCommand[] = [
  {
    name: 'model',
    description: 'Switch model (or "auto" for smart routing)',
    args: '<model-name|auto|sonnet|opus|haiku|kimi|grok>',
    category: 'config',
    handler: (args, ctx) => {
      const MODEL_ALIASES: Record<string, string> = {
        'sonnet': 'claude-sonnet-4-6',
        'sonnet46': 'claude-sonnet-4-6',
        'sonnet45': 'claude-sonnet-4-5',
        'opus': 'claude-opus-4-6',
        'haiku': 'claude-haiku-4-5-20251001',
        'kimi': 'accounts/fireworks/routers/kimi-k2p5-turbo',
        'k2': 'accounts/fireworks/routers/kimi-k2p5-turbo',
        'deepseek': 'accounts/fireworks/models/deepseek-v3p2',
        'grok': 'grok-3',
        'grok-mini': 'grok-3-mini',
        'gemini': 'gemini-2.5-pro',
        'flash': 'gemini-2.5-flash',
        'mistral': 'mistral-large-latest',
        'groq': 'llama-3.3-70b-versatile',
      };
      const raw = args.trim();
      if (!raw) return chalk.dim(`Current model: ${ctx.model}`);
      const resolved = MODEL_ALIASES[raw.toLowerCase()] ?? raw;
      ctx.model = resolved;
      ctx.modelTier = resolved === 'auto' ? 'auto' : 'full';
      const aliasNote = MODEL_ALIASES[raw.toLowerCase()] ? chalk.dim(` (${raw} → ${resolved})`) : '';
      return chalk.dim(`Model: ${resolved}`) + aliasNote;
    },
  },
  {
    name: 'keys',
    description: 'Manage BYOK API keys (set / list / delete)',
    args: '[set <KEY_NAME> <value> | list | delete <KEY_NAME>]',
    category: 'config',
    handler: async (args) => {
      const { setKey, deleteKey, listKeys } = await import('../../utils/keys.js');
      const parts = args.trim().split(/\s+/);
      const sub = parts[0] ?? 'list';
      if (sub === 'list' || !sub) {
        const keys = listKeys();
        if (keys.length === 0) return chalk.dim('No BYOK keys saved. Use: /keys set OPENROUTER_API_KEY sk-...');
        return keys.map(k => chalk.green('  ✓ ') + chalk.white(k)).join('\n');
      }
      if (sub === 'set') {
        const [, name, value] = parts;
        if (!name || !value) return chalk.red('Usage: /keys set KEY_NAME value');
        setKey(name, value);
        process.env[name] = value;
        return chalk.green(`✓ Saved ${name} to ~/.dirgha/keys.json (active immediately)`);
      }
      if (sub === 'delete') {
        const [, name] = parts;
        if (!name) return chalk.red('Usage: /keys delete KEY_NAME');
        deleteKey(name);
        return chalk.dim(`Deleted ${name}`);
      }
      return chalk.red(`Unknown sub-command: ${sub}. Use: set / list / delete`);
    },
  },
  {
    name: 'config',
    description: 'Show or set configuration',
    args: '[key] [value]',
    category: 'config',
    handler: (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      if (!parts[0]) {
        const t = getTheme();
        return [
          '',
          `  ${t.dim('theme')}            ${ctx.activeTheme}`,
          `  ${t.dim('model')}            ${ctx.model}`,
          `  ${t.dim('permissionLevel')}  ${ctx.permissionLevel}`,
          '',
          `  Use: /config theme <${['default', 'midnight', 'ocean', 'matrix', 'warm'].join('|')}>`,
          '',
        ].join('\n');
      }
      if (parts[0] === 'theme' && parts[1]) {
        ctx.activeTheme = parts[1] as ThemeName;
        return chalk.green(`✓ Theme set to: ${parts[1]}`);
      }
      return chalk.red(`Unknown config key: ${parts[0]}`);
    },
  },
  {
    name: 'theme',
    description: 'Switch color theme (default|midnight|ocean|solarized|warm)',
    args: '[name]',
    category: 'config',
    handler: (args) => {
      const name = args.trim() as ThemeName;
      const names = Object.keys(THEMES) as ThemeName[];
      if (!name) {
        return [
          '',
          `  Current theme: ${chalk.bold(getActiveThemeName())}`,
          `  Available: ${names.map(n => n === getActiveThemeName() ? chalk.bold(n) : chalk.dim(n)).join('  ')}`,
          `  Usage: /theme midnight`,
          '',
        ].join('\n');
      }
      if (!setTheme(name)) return chalk.red(`Unknown theme: ${name}. Available: ${names.join(', ')}`);
      return chalk.green(`✓ Theme: ${name} (takes effect immediately)`);
    },
  },
  {
    name: 'bind',
    description: 'Set a key binding (e.g. /bind scrollUp ctrl+u)',
    args: '<action> <binding>',
    category: 'config',
    handler: (args) => {
      const [action, binding] = args.trim().split(/\s+/);
      if (!action || !binding) {
        return [
          '',
          '  Usage: /bind <action> <binding>',
          '  Example: /bind scrollUp ctrl+u',
          '  Actions: scrollUp scrollDown historySearch sessionPicker',
          '           modelPicker keysPicker cancel openEditor',
          '',
        ].join('\n');
      }
      if (!setKeybinding(action as any, binding)) return chalk.red(`Invalid action: ${action}`);
      return chalk.green(`✓ Bound ${action} → ${binding} (saved to ~/.dirgha/keybindings.json)`);
    },
  },
  {
    name: 'soul',
    description: 'Show or set agent persona (Architect | Cowboy | Security | Hacker | Pedant)',
    args: '[persona|path]',
    category: 'config',
    handler: async (args) => {
      const { readSoul, writeSoul, getSoulPath, SOUL_TEMPLATES } = await import('../../utils/soul.js');
      const arg = args.trim();
      if (!arg) {
        const soul = readSoul();
        if (!soul) return chalk.dim(`No soul configured. Run: /soul Architect  (or edit ${getSoulPath()})`);
        return chalk.dim(`Soul (${getSoulPath()}):\n\n`) + soul;
      }
      if (arg === 'path') return getSoulPath();
      if (SOUL_TEMPLATES[arg]) {
        writeSoul(arg);
        return chalk.green(`✓ Soul set to ${arg} — takes effect next session`);
      }
      const names = Object.keys(SOUL_TEMPLATES).join(' | ');
      return chalk.red(`Unknown persona: ${arg}. Options: ${names}`);
    },
  },
  {
    name: 'ratelimits',
    aliases: ['rl'],
    description: 'Show per-provider rate-limit budget (live)',
    args: '[provider] [rpm]',
    category: 'config',
    handler: async (args) => {
      const { snapshot } = await import('../../providers/rate-limit.js');
      const parts = args.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 2) {
        const [prov, rpmStr] = parts;
        const rpm = parseInt(rpmStr!, 10);
        if (!Number.isFinite(rpm) || rpm < 0) return chalk.red(`Invalid RPM: ${rpmStr}`);
        process.env[`DIRGHA_RATE_LIMIT_${prov!.toUpperCase()}`] = String(rpm);
        return chalk.green(`✓ ${prov}: RPM set to ${rpm} (takes effect on next request; persist via: dirgha keys set DIRGHA_RATE_LIMIT_${prov!.toUpperCase()} ${rpm})`);
      }
      const snap = snapshot();
      const lines = ['', chalk.bold('  Provider rate-limit budgets (RPM, available now):'), ''];
      if (Object.keys(snap).length === 0) {
        lines.push(chalk.dim('  (no provider has been hit yet this session)'));
      } else {
        for (const [p, s] of Object.entries(snap)) {
          const bar = '▓'.repeat(Math.ceil(s.available / Math.max(s.rpm, 1) * 10)).padEnd(10, '░');
          lines.push(`  ${chalk.cyan(p.padEnd(12))} ${bar}  ${s.available}/${s.rpm}`);
        }
      }
      lines.push('', chalk.dim('  Set:    /ratelimits <provider> <rpm>'), chalk.dim('  Env:    DIRGHA_RATE_LIMIT_<PROVIDER>=<rpm>  (0 disables)'), '');
      return lines.join('\n');
    },
  },
  {
    name: 'skills',
    description: 'Manage agent skills: list · enable <name> · disable <name>',
    args: '[list|enable|disable] [name]',
    category: 'config',
    handler: async (args) => {
      const { listSkillsText, enableSkill, disableSkill } = await import('../../skills/index.js');
      const parts = args.trim().split(/\s+/);
      const sub = parts[0]?.toLowerCase() ?? 'list';
      const name = parts[1] ?? '';
      if (sub === 'enable' && name) { enableSkill(name); return chalk.green(`✓ Skill enabled: ${name}`); }
      if (sub === 'disable' && name) { disableSkill(name); return chalk.green(`○ Skill disabled: ${name}`); }
      return listSkillsText();
    },
  },
];
