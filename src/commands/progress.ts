/**
 * Theme-aware progress indicators
 * Sprint 13: CLI Polish
 */
import chalk from 'chalk';

export type Theme = 'minimal' | 'default' | 'fancy';

interface ThemeConfig {
  frames: string[];
  success: string;
  failure: string;
  warning: string;
  info: string;
  color: (t: string) => string;
}

const THEMES: Record<Theme, ThemeConfig> = {
  minimal: {
    frames: ['.', '..', '...'],
    success: 'ok',
    failure: 'x',
    warning: '!',
    info: 'i',
    color: chalk.dim,
  },
  default: {
    frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    success: '✓',
    failure: '✗',
    warning: '⚠',
    info: 'ℹ',
    color: chalk.cyan,
  },
  fancy: {
    frames: ['◐', '◓', '◑', '◒', '🌑', '🌒', '🌓', '🌔', '🌕', '🌖'],
    success: '✨',
    failure: '💥',
    warning: '⚡',
    info: '💡',
    color: chalk.magenta,
  },
};

let currentTheme: Theme = 'default';

export function setTheme(theme: Theme): void {
  currentTheme = theme;
}

export function getTheme(): Theme {
  return currentTheme;
}

export function getThemeConfig(): ThemeConfig {
  return THEMES[currentTheme];
}

// Lightweight spinner
export function createSpinner(text: string) {
  const cfg = getThemeConfig();
  let frame = 0;
  let interval: NodeJS.Timeout | null = null;
  
  const start = () => {
    if (interval) return;
    interval = setInterval(() => {
      process.stdout.write(`\r${cfg.color(cfg.frames[frame])} ${text}`);
      frame = (frame + 1) % cfg.frames.length;
    }, 80);
  };
  
  const stop = (final?: string) => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    if (final) {
      process.stdout.write(`\r${final}\n`);
    } else {
      process.stdout.write('\r' + ' '.repeat(text.length + 4) + '\r');
    }
  };
  
  return {
    start,
    stop,
    succeed: (msg?: string) => stop(`${chalk.green(cfg.success)} ${msg || text}`),
    fail: (msg?: string) => stop(`${chalk.red(cfg.failure)} ${msg || text}`),
    warn: (msg?: string) => stop(`${chalk.yellow(cfg.warning)} ${msg || text}`),
    info: (msg?: string) => stop(`${chalk.blue(cfg.info)} ${msg || text}`),
  };
}

// Progress bar
export function progressBar(current: number, total: number, width = 30): string {
  const pct = Math.min(100, Math.round((current / total) * 100));
  const filled = Math.round((pct / 100) * width);
  const color = pct >= 90 ? chalk.green : pct >= 50 ? chalk.yellow : chalk.red;
  return `[${color('█'.repeat(filled))}${chalk.dim('░'.repeat(width - filled))}] ${pct}%`;
}

// Multi-step progress
export function multiStep(steps: string[], current: number): string {
  return steps.map((s, i) => {
    if (i < current) return chalk.green('✓ ' + s);
    if (i === current) return chalk.cyan('→ ' + s);
    return chalk.dim('○ ' + s);
  }).join('  ');
}
