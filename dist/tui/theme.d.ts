/**
 * ANSI colour tokens. Scoped to what the TUI actually uses — no
 * overreach into a full style system. Callers wrap strings via style().
 */
export interface Theme {
    userPrompt: string;
    assistant: string;
    thinking: string;
    tool: string;
    toolError: string;
    systemNotice: string;
    muted: string;
    accent: string;
    warning: string;
    danger: string;
    success: string;
}
export declare const darkTheme: Theme;
export declare const lightTheme: Theme;
export declare const defaultTheme: Theme;
export type ThemeName = 'readable' | 'dark' | 'light' | 'none' | 'midnight' | 'ocean' | 'solarized' | 'warm' | 'violet-storm' | 'cosmic' | 'nord' | 'ember' | 'sakura' | 'obsidian-gold' | 'crimson';
/**
 * Hex-colour palette for Ink components and downstream renderers that
 * support truecolor output. The escape-code `Theme` above remains the
 * source of truth for plain terminal rendering; Ink components can
 * read the hex palette via `paletteFor(name)` when they want richer
 * differentiation than ANSI 16-colour allows.
 *
 * Ported from the v1 `src/tui/themes.ts` catalogue so users who set
 * `/theme cosmic` etc. don't lose their name back to "unknown theme".
 */
export interface Palette {
    brand: string;
    accent: string;
    error: string;
    textPrimary: string;
    textMuted: string;
    borderActive: string;
    borderIdle: string;
    logoA: string;
    logoB: string;
}
export declare const PALETTES: Record<ThemeName, Palette>;
export declare function paletteFor(name: string | undefined): Palette;
/**
 * The 16-ANSI Theme each named theme maps to. `dark`/`light`/`none`
 * use their dedicated escape-code tables; everything else falls back
 * to dark — the visual differentiation lives in the hex palette and
 * is consumed by Ink components that opt into `paletteFor()`.
 */
export declare const themes: Record<ThemeName, Theme>;
/** Look up a theme by name; unknown names fall back to dark. */
export declare function getTheme(name: string | undefined): Theme;
export declare function listThemes(): ThemeName[];
export declare function style(token: string, text: string): string;
export declare function styleDim(text: string): string;
export declare function noColour(): Theme;
