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
import type { Theme } from './theme.js';
/** All theme names visible to the user (baked-in + user-defined). */
export declare function listAvailableThemes(home?: string): string[];
/**
 * Resolve a theme by name. Order:
 *   1. Baked-in (`dark`, `light`, `none`).
 *   2. `~/.dirgha/themes/<name>.json` — partial Theme JSON.
 *   3. Fall back to `darkTheme` with a one-line stderr warning.
 */
export declare function resolveThemeByName(name: string | undefined, home?: string): Theme;
