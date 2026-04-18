/**
 * repl/slash/theme.ts — Theme and logo palette picker
 */
import chalk from 'chalk';
import type { SlashCommand } from './types.js';
import { getTheme, setTheme, getLogoTheme, setLogoTheme, setCustomLogoPath, getCustomLogoPath } from '../themes.js';
import type { ThemeName } from '../../types.js';

const THEME_SWATCHES: Record<string, string> = {
  default: '#0F62FE', midnight: '#8B5CF6', ocean: '#06B6D4', matrix: '#22C55E',
  warm: '#F59E0B', 'violet-storm': '#8B5CF6', cosmic: '#FF006E', nord: '#88C0D0',
  ember: '#FF8C00', sakura: '#FF85A1', 'obsidian-gold': '#F5C518', crimson: '#FF2952',
};

const LOGO_SWATCHES: Record<string, string> = {
  'violet-storm': '#8B5CF6', cosmic: '#FF006E', 'dirgha-blue': '#0F62FE',
  matrix: '#00FF41', crimson: '#FF2952', nord: '#88C0D0', sakura: '#FF85A1',
  ember: '#FF8C00', 'obsidian-gold': '#F5C518', 'mono-white': '#FFFFFF',
};

const ALL_THEMES = Object.keys(THEME_SWATCHES) as ThemeName[];
const ALL_LOGO_PALETTES = Object.keys(LOGO_SWATCHES);

export default {
  name: 'theme',
  description: 'Manage TUI theme and logo palette',
  args: '[tui-name | logo [name|custom <path>|reset]]',
  category: 'settings',
  aliases: ['t'],
  examples: ['/theme violet-storm', '/theme logo ember', '/theme logo custom ~/mylogo.txt', '/theme list'],
  handler: async (args: string, _ctx: any) => {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    const t = getTheme();

    // /theme or /theme list — list all TUI themes
    if (!parts[0] || parts[0] === 'list') {
      const lines = [
        '',
        t.header('  TUI THEMES'),
        ...ALL_THEMES.map(name => {
          const isActive = name === _ctx.activeTheme;
          const swatch = chalk.hex(THEME_SWATCHES[name])('██');
          const label = isActive ? chalk.bold(name) : name;
          const marker = isActive ? chalk.green(' ✓') : '';
          return `    ${swatch} ${label}${marker}`;
        }),
        '',
        `  ${t.dim('Usage: /theme <name>')}`,
        '',
      ];
      return lines.join('\n');
    }

    // /theme logo or /theme logo list — list all logo palettes
    if (parts[0] === 'logo' && (!parts[1] || parts[1] === 'list')) {
      const currentLogo = getLogoTheme();
      const customPath = getCustomLogoPath();
      const lines = [
        '',
        t.header('  LOGO PALETTES'),
        ...ALL_LOGO_PALETTES.map(name => {
          const isActive = name === currentLogo && !customPath;
          const swatch = chalk.hex(LOGO_SWATCHES[name])('██');
          const label = isActive ? chalk.bold(name) : name;
          const marker = isActive ? chalk.green(' ✓') : '';
          return `    ${swatch} ${label}${marker}`;
        }),
        '',
        customPath ? `  ${t.success('✓')} Custom logo: ${t.dim(customPath)}` : '',
        '',
        `  ${t.dim('Usage: /theme logo <name>')}`,
        `  ${t.dim('       /theme logo custom <path>')}`,
        `  ${t.dim('       /theme logo reset')}`,
        '',
      ];
      return lines.filter(Boolean).join('\n');
    }

    // /theme logo reset — clear custom logo
    if (parts[0] === 'logo' && parts[1] === 'reset') {
      setCustomLogoPath('');
      return chalk.green('✓ Custom logo cleared. Restart CLI to see default logo.');
    }

    // /theme logo custom <path> — set custom logo from file
    if (parts[0] === 'logo' && parts[1] === 'custom') {
      const logoPath = parts.slice(2).join(' ');
      if (!logoPath) {
        return chalk.red('Usage: /theme logo custom <path>');
      }
      try {
        const fs = await import('fs');
        if (!fs.existsSync(logoPath)) {
          return chalk.red(`Error: File not found: ${logoPath}`);
        }
        setCustomLogoPath(logoPath);
        return chalk.green(`✓ Custom logo set: ${logoPath}\nRestart CLI to apply.`);
      } catch (e) {
        return chalk.red(`Error: ${e}`);
      }
    }

    // /theme logo <name> — set logo palette
    if (parts[0] === 'logo') {
      const logoName = parts[1];
      if (!ALL_LOGO_PALETTES.includes(logoName)) {
        return chalk.red(`Unknown logo palette: ${logoName}\nAvailable: ${ALL_LOGO_PALETTES.join(', ')}`);
      }
      setLogoTheme(logoName);
      return chalk.green(`✓ Logo palette set: ${logoName}\nRestart CLI to apply.`);
    }

    // /theme <name> — set TUI theme
    const themeName = parts[0] as ThemeName;
    if (!ALL_THEMES.includes(themeName)) {
      return chalk.red(`Unknown theme: ${themeName}\nAvailable: ${ALL_THEMES.join(', ')}`);
    }
    setTheme(themeName);
    _ctx.activeTheme = themeName;
    return chalk.green(`✓ Theme set: ${themeName}`);
  },
} satisfies SlashCommand;
