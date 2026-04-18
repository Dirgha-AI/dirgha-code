// @ts-nocheck
/**
 * tui/colors.ts — Live-swappable theme color tokens.
 *
 * All TUI components import `C` — it's a Proxy that always returns the
 * current theme's values, so `/theme <name>` takes effect on next render
 * without touching any component code.
 */
import os from 'os';
import fs from 'fs';
import path from 'path';

export type ThemeName = 'default' | 'midnight' | 'ocean' | 'solarized' | 'warm'
  | 'violet-storm' | 'cosmic' | 'nord' | 'ember' | 'sakura' | 'obsidian-gold' | 'crimson';

export interface ColorSet {
  brand: string; accent: string; error: string;
  textPrimary: string; textSecondary: string; textMuted: string; textDim: string;
  borderActive: string; borderAccent: string; borderIdle: string; borderSubtle: string; borderAssist: string;
  logoA: string; logoB: string;
}

// ── Theme definitions ────────────────────────────────────────────────────────

export const THEMES: Record<ThemeName, ColorSet> = {
  /** Default — dark warm charcoal, green brand */
  default: {
    brand: '#22C55E', accent: '#F59E0B', error: '#EF4444',
    textPrimary: '#E5E7EB', textSecondary: '#9CA3AF', textMuted: '#6B7280', textDim: '#4B5563',
    borderActive: '#22C55E', borderAccent: '#F59E0B', borderIdle: '#1F2937', borderSubtle: '#1F2937', borderAssist: '#374151',
    logoA: '#22C55E', logoB: '#60A5FA',
  },
  /** Midnight — deep purple, cool slate text */
  midnight: {
    brand: '#8B5CF6', accent: '#F59E0B', error: '#EF4444',
    textPrimary: '#E2E8F0', textSecondary: '#94A3B8', textMuted: '#64748B', textDim: '#334155',
    borderActive: '#8B5CF6', borderAccent: '#F59E0B', borderIdle: '#1E293B', borderSubtle: '#1E293B', borderAssist: '#2D3748',
    logoA: '#8B5CF6', logoB: '#60A5FA',
  },
  /** Ocean — teal/cyan, sea-glass palette */
  ocean: {
    brand: '#06B6D4', accent: '#F59E0B', error: '#EF4444',
    textPrimary: '#ECFEFF', textSecondary: '#67E8F9', textMuted: '#22D3EE', textDim: '#0E7490',
    borderActive: '#06B6D4', borderAccent: '#F59E0B', borderIdle: '#164E63', borderSubtle: '#164E63', borderAssist: '#0E7490',
    logoA: '#06B6D4', logoB: '#7DD3FC',
  },
  /** Solarized — classic Ethan Schoonover solarized dark */
  solarized: {
    brand: '#859900', accent: '#CB4B16', error: '#DC322F',
    textPrimary: '#EEE8D5', textSecondary: '#839496', textMuted: '#657B83', textDim: '#586E75',
    borderActive: '#859900', borderAccent: '#CB4B16', borderIdle: '#073642', borderSubtle: '#073642', borderAssist: '#002B36',
    logoA: '#268BD2', logoB: '#859900',
  },
  /** Warm — amber/orange, cozy campfire */
  warm: {
    brand: '#F59E0B', accent: '#EF4444', error: '#DC2626',
    textPrimary: '#FEF3C7', textSecondary: '#FDE68A', textMuted: '#D97706', textDim: '#92400E',
    borderActive: '#F59E0B', borderAccent: '#EF4444', borderIdle: '#1C0A00', borderSubtle: '#1C0A00', borderAssist: '#451A03',
    logoA: '#F59E0B', logoB: '#EF4444',
  },
};

// ── Active theme state ───────────────────────────────────────────────────────

let _active: ThemeName = 'default';
let _colors: ColorSet = THEMES.default;

function configPath(): string {
  return path.join(os.homedir(), '.dirgha', 'config.json');
}

/** Load saved theme from ~/.dirgha/config.json on first import */
function loadSavedTheme(): void {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    const name = cfg.theme as ThemeName;
    if (name && THEMES[name]) { _active = name; _colors = THEMES[name]; }
  } catch { /* default stays */ }
}
loadSavedTheme();

/** Switch theme and persist to config. Effective on next render. */
export function setTheme(name: ThemeName): boolean {
  if (!THEMES[name]) return false;
  _active = name;
  _colors = THEMES[name];
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    let cfg: Record<string, unknown> = {};
    try { cfg = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { /* fresh */ }
    cfg.theme = name;
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
  } catch { /* ignore write errors */ }
  return true;
}

export function getActiveThemeName(): ThemeName { return _active; }

/** C — live-reading color proxy. Import and use `C.brand` etc. */
export const C = new Proxy({} as ColorSet, {
  get(_t, prop) { return _colors[prop as keyof ColorSet]; },
});
