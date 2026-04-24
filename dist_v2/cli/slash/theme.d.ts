/**
 * /theme — switch the TUI theme. v2 currently ships a single theme
 * (defaultTheme) plus a noColour() helper; no runtime mutation API
 * is exposed. This command therefore stores the preference in
 * process.env.DIRGHA_THEME and ~/.dirgha/config.json so the next
 * process can honour it. STUB until the TUI grows a theme registry.
 */
import type { SlashCommand } from './types.js';
export declare const themeCommand: SlashCommand;
