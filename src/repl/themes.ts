import chalk from 'chalk';
import os from 'os';
import fs from 'fs';
import path from 'path';
import type { ThemeName } from '../types.js';

export interface Theme {
  primary: (s: string) => string;
  dim: (s: string) => string;
  code: (s: string) => string;
  success: (s: string) => string;
  error: (s: string) => string;
  warning: (s: string) => string;
  bold: (s: string) => string;
  header: (s: string) => string;
  // Extended theme properties (used by session/team/config/screen commands)
  secondary: (s: string) => string;
  muted: (s: string) => string;
  command: (s: string) => string;
  heading: (s: string) => string;
  info: (s: string) => string;
}

const themes: Record<ThemeName, Theme> = {
  default: {
    primary: chalk.hex('#0F62FE'),
    dim: chalk.gray,
    code: chalk.yellow,
    success: chalk.green,
    error: chalk.red,
    warning: chalk.hex('#F59E0B'),
    bold: chalk.bold,
    header: (s) => chalk.bold.underline(s),
    secondary: chalk.cyan,
    muted: chalk.gray,
    command: chalk.cyan,
    heading: chalk.bold.underline,
    info: chalk.blueBright,
  },
  midnight: {
    primary: chalk.hex('#8B5CF6'),
    dim: chalk.hex('#6B7280'),
    code: chalk.hex('#60A5FA'),
    success: chalk.hex('#10B981'),
    error: chalk.hex('#EF4444'),
    warning: chalk.hex('#FBBF24'),
    bold: chalk.bold,
    header: (s) => chalk.bold.hex('#8B5CF6')(s),
    secondary: chalk.hex('#60A5FA'),
    muted: chalk.hex('#4B5563'),
    command: chalk.hex('#A78BFA'),
    heading: (s) => chalk.bold.hex('#8B5CF6')(s),
    info: chalk.hex('#60A5FA'),
  },
  ocean: {
    primary: chalk.hex('#06B6D4'),
    dim: chalk.hex('#0E7490'),
    code: chalk.hex('#7DD3FC'),
    success: chalk.hex('#34D399'),
    error: chalk.hex('#F87171'),
    warning: chalk.hex('#FCD34D'),
    bold: chalk.bold,
    header: (s) => chalk.bold.hex('#06B6D4')(s),
    secondary: chalk.hex('#7DD3FC'),
    muted: chalk.hex('#164E63'),
    command: chalk.hex('#38BDF8'),
    heading: (s) => chalk.bold.hex('#06B6D4')(s),
    info: chalk.hex('#7DD3FC'),
  },
  matrix: {
    primary: chalk.hex('#22C55E'),
    dim: chalk.hex('#166534'),
    code: chalk.hex('#86EFAC'),
    success: chalk.hex('#4ADE80'),
    error: chalk.hex('#FF0000'),
    warning: chalk.hex('#FDE047'),
    bold: chalk.bold,
    header: (s) => chalk.bold.hex('#22C55E')(s),
    secondary: chalk.hex('#86EFAC'),
    muted: chalk.hex('#14532D'),
    command: chalk.hex('#4ADE80'),
    heading: (s) => chalk.bold.hex('#22C55E')(s),
    info: chalk.hex('#86EFAC'),
  },
  warm: {
    primary: chalk.hex('#F59E0B'),
    dim: chalk.hex('#92400E'),
    code: chalk.hex('#FCD34D'),
    success: chalk.hex('#D97706'),
    error: chalk.hex('#DC2626'),
    warning: chalk.hex('#FBBF24'),
    bold: chalk.bold,
    header: (s) => chalk.bold.hex('#F59E0B')(s),
    secondary: chalk.hex('#FCD34D'),
    muted: chalk.hex('#78350F'),
    command: chalk.hex('#F59E0B'),
    heading: (s) => chalk.bold.hex('#F59E0B')(s),
    info: chalk.hex('#FCD34D'),
  },
  'violet-storm': {
    primary: chalk.hex('#8B5CF6'),
    dim: chalk.hex('#5B21B6'),
    code: chalk.hex('#C4B5FD'),
    success: chalk.hex('#A3E635'),
    error: chalk.hex('#F87171'),
    warning: chalk.hex('#FBBF24'),
    bold: chalk.bold,
    header: (s) => chalk.bold.hex('#8B5CF6')(s),
    secondary: chalk.hex('#A78BFA'),
    muted: chalk.hex('#4C1D95'),
    command: chalk.hex('#C4B5FD'),
    heading: (s) => chalk.bold.hex('#8B5CF6')(s),
    info: chalk.hex('#DDD6FE'),
  },
  cosmic: {
    primary: chalk.hex('#FF006E'),
    dim: chalk.hex('#8338EC'),
    code: chalk.hex('#FFBE0B'),
    success: chalk.hex('#06FFA5'),
    error: chalk.hex('#FF4136'),
    warning: chalk.hex('#FFBE0B'),
    bold: chalk.bold,
    header: (s) => chalk.bold.hex('#FF006E')(s),
    secondary: chalk.hex('#3A86FF'),
    muted: chalk.hex('#6B21A8'),
    command: chalk.hex('#FB5607'),
    heading: (s) => chalk.bold.hex('#FF006E')(s),
    info: chalk.hex('#3A86FF'),
  },
  nord: {
    primary: chalk.hex('#88C0D0'),
    dim: chalk.hex('#5E81AC'),
    code: chalk.hex('#A3BE8C'),
    success: chalk.hex('#A3BE8C'),
    error: chalk.hex('#BF616A'),
    warning: chalk.hex('#EBCB8B'),
    bold: chalk.bold,
    header: (s) => chalk.bold.hex('#88C0D0')(s),
    secondary: chalk.hex('#81A1C1'),
    muted: chalk.hex('#434C5E'),
    command: chalk.hex('#88C0D0'),
    heading: (s) => chalk.bold.hex('#88C0D0')(s),
    info: chalk.hex('#81A1C1'),
  },
  ember: {
    primary: chalk.hex('#FF8C00'),
    dim: chalk.hex('#FF4500'),
    code: chalk.hex('#FFD700'),
    success: chalk.hex('#A3E635'),
    error: chalk.hex('#FF2D00'),
    warning: chalk.hex('#FFD700'),
    bold: chalk.bold,
    header: (s) => chalk.bold.hex('#FF8C00')(s),
    secondary: chalk.hex('#FFB300'),
    muted: chalk.hex('#7C2D12'),
    command: chalk.hex('#FF8C00'),
    heading: (s) => chalk.bold.hex('#FF8C00')(s),
    info: chalk.hex('#FFF176'),
  },
  sakura: {
    primary: chalk.hex('#FF85A1'),
    dim: chalk.hex('#C4306A'),
    code: chalk.hex('#FFB7C5'),
    success: chalk.hex('#86EFAC'),
    error: chalk.hex('#F43F5E'),
    warning: chalk.hex('#FBBF24'),
    bold: chalk.bold,
    header: (s) => chalk.bold.hex('#FF85A1')(s),
    secondary: chalk.hex('#FF5C8D'),
    muted: chalk.hex('#4C0519'),
    command: chalk.hex('#FFB7C5'),
    heading: (s) => chalk.bold.hex('#FF85A1')(s),
    info: chalk.hex('#FFF0F3'),
  },
  'obsidian-gold': {
    primary: chalk.hex('#F5C518'),
    dim: chalk.hex('#C47C0A'),
    code: chalk.hex('#FFF8E7'),
    success: chalk.hex('#A3E635'),
    error: chalk.hex('#FF4136'),
    warning: chalk.hex('#FFD700'),
    bold: chalk.bold,
    header: (s) => chalk.bold.hex('#F5C518')(s),
    secondary: chalk.hex('#E8A015'),
    muted: chalk.hex('#451A03'),
    command: chalk.hex('#F5C518'),
    heading: (s) => chalk.bold.hex('#F5C518')(s),
    info: chalk.hex('#FFF8E7'),
  },
  crimson: {
    primary: chalk.hex('#FF2952'),
    dim: chalk.hex('#C10023'),
    code: chalk.hex('#FFB3C1'),
    success: chalk.hex('#86EFAC'),
    error: chalk.hex('#FF0040'),
    warning: chalk.hex('#FBBF24'),
    bold: chalk.bold,
    header: (s) => chalk.bold.hex('#FF2952')(s),
    secondary: chalk.hex('#FF6B8A'),
    muted: chalk.hex('#4C0519'),
    command: chalk.hex('#FFB3C1'),
    heading: (s) => chalk.bold.hex('#FF2952')(s),
    info: chalk.hex('#FFB3C1'),
  },
};

function configPath(): string {
  return path.join(os.homedir(), '.dirgha', 'config.json');
}

export function getActiveTheme(): ThemeName {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return (cfg.theme as ThemeName) ?? 'default';
  } catch {
    return 'default';
  }
}

export function getTheme(name?: ThemeName): Theme {
  return themes[name ?? getActiveTheme()] ?? themes.default;
}

export function listThemes(): ThemeName[] {
  return Object.keys(themes) as ThemeName[];
}

export function setTheme(name: ThemeName): void {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  let cfg: Record<string, unknown> = {};
  try { cfg = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  fs.writeFileSync(p, JSON.stringify({ ...cfg, theme: name }, null, 2));
}

export function getLogoTheme(): string {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return (cfg.logoTheme as string) ?? 'violet-storm';
  } catch {
    return 'violet-storm';
  }
}

export function setLogoTheme(name: string): void {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  let cfg: Record<string, unknown> = {};
  try { cfg = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  fs.writeFileSync(p, JSON.stringify({ ...cfg, logoTheme: name }, null, 2));
}

export function getCustomLogoPath(): string {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return (cfg.customLogoPath as string) ?? '';
  } catch {
    return '';
  }
}

export function setCustomLogoPath(p: string): void {
  const configP = configPath();
  fs.mkdirSync(path.dirname(configP), { recursive: true });
  let cfg: Record<string, unknown> = {};
  try { cfg = JSON.parse(fs.readFileSync(configP, 'utf8')); } catch {}
  fs.writeFileSync(configP, JSON.stringify({ ...cfg, customLogoPath: p }, null, 2));
}
