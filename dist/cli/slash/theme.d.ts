/**
 * /theme — switch the readline TUI theme. Writes the preference to
 * `~/.dirgha/config.json` (consumed by future sessions) and flips the
 * live theme via `ctx.setTheme()`. The Ink TUI uses a static Ink
 * render tree and won't re-colourise live; a restart picks up the
 * new theme there.
 */
import type { SlashCommand } from './types.js';
export declare const themeCommand: SlashCommand;
