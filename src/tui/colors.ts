/**
 * tui/colors.ts — Live-swappable theme color tokens.
 */
import os from 'os';
import fs from 'fs';
import path from 'path';
import { THEMES, type ThemeName, type ColorSet } from './themes.js';

export { THEMES };
export type { ThemeName, ColorSet };

let _active: ThemeName = 'default';
let _colors: ColorSet = THEMES.default;

function configPath(): string {
  return path.join(os.homedir(), '.dirgha', 'config.json');
}

function loadSavedTheme(): void {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    const name = cfg.theme as ThemeName;
    if (name && THEMES[name]) { _active = name; _colors = THEMES[name]; }
  } catch { /* default stays */ }
}
loadSavedTheme();

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

export const C = new Proxy({} as ColorSet, {
  get(_t, prop) { return _colors[prop as keyof ColorSet]; },
});
