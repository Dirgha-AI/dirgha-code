/**
 * User-defined theme loader.
 *
 * Reads `~/.dirgha/themes/<name>.json` at boot when a theme name isn't
 * one of the baked-in values (`dark` / `light` / `none`). The JSON is
 * a partial Theme — any missing keys fall back to `darkTheme` so a
 * minimal theme file (one or two colour overrides) works.
 *
 * Format example (`~/.dirgha/themes/sunrise.json`):
 *
 *   {
 *     "userPrompt": "[33m",
 *     "assistant":  "[36m",
 *     "accent":     "[35m"
 *   }
 *
 * ANSI escape sequences are written verbatim in JSON. We don't transform
 * names (e.g. "magenta" → "[35m") to keep the parser zero-risk.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Theme } from './theme.js';
import { darkTheme, lightTheme, noColour, themes } from './theme.js';

const BAKED_IN = new Set(['readable', 'dark', 'light', 'none']);

/** All theme names visible to the user (baked-in + user-defined). */
export function listAvailableThemes(home: string = homedir()): string[] {
  const out: string[] = ['readable', 'dark', 'light', 'none'];
  try {
    const dir = join(home, '.dirgha', 'themes');
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.json')) {
        out.push(e.name.replace(/\.json$/, ''));
      }
    }
  } catch { /* themes dir absent — fine */ }
  return out;
}

/**
 * Resolve a theme by name. Order:
 *   1. Baked-in (`dark`, `light`, `none`).
 *   2. `~/.dirgha/themes/<name>.json` — partial Theme JSON.
 *   3. Fall back to `darkTheme` with a one-line stderr warning.
 */
export function resolveThemeByName(name: string | undefined, home: string = homedir()): Theme {
  if (!name) return darkTheme;
  if (BAKED_IN.has(name)) {
    return themes[name as keyof typeof themes] ?? darkTheme;
  }
  // User-defined.
  try {
    const path = join(home, '.dirgha', 'themes', `${name}.json`);
    const raw = readFileSync(path, 'utf8');
    const partial = JSON.parse(raw) as Partial<Theme>;
    return { ...darkTheme, ...partial };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`warning: theme '${name}' not found — falling back to dark (${msg})\n`);
    return darkTheme;
  }
}

void lightTheme; void noColour;
