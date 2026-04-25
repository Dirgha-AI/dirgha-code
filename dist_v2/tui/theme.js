/**
 * ANSI colour tokens. Scoped to what the TUI actually uses — no
 * overreach into a full style system. Callers wrap strings via style().
 */
const RESET = '\x1b[0m';
// Dark palette — tuned for dark terminal backgrounds.
export const darkTheme = {
    userPrompt: '\x1b[1;36m', // bold cyan
    assistant: '\x1b[0m', // plain
    thinking: '\x1b[2;37m', // dim grey
    tool: '\x1b[35m', // magenta
    toolError: '\x1b[31m', // red
    systemNotice: '\x1b[33m', // yellow
    muted: '\x1b[2m',
    accent: '\x1b[1;34m',
    warning: '\x1b[33m',
    danger: '\x1b[31m',
    success: '\x1b[32m',
};
// Light palette — swaps dim/bright so white terminals stay legible.
export const lightTheme = {
    userPrompt: '\x1b[1;34m', // bold blue (cyan washes out on light)
    assistant: '\x1b[0m',
    thinking: '\x1b[2;30m', // dim black (not grey)
    tool: '\x1b[35m',
    toolError: '\x1b[1;31m', // bold red so it pops
    systemNotice: '\x1b[33m',
    muted: '\x1b[2;30m',
    accent: '\x1b[1;34m',
    warning: '\x1b[1;33m',
    danger: '\x1b[1;31m',
    success: '\x1b[1;32m',
};
// Backward-compat alias — existing call sites use `defaultTheme`.
export const defaultTheme = darkTheme;
export const PALETTES = {
    dark: { brand: '#22C55E', accent: '#F59E0B', error: '#EF4444', textPrimary: '#E5E7EB', textMuted: '#6B7280', borderActive: '#22C55E', borderIdle: '#1F2937', logoA: '#22C55E', logoB: '#60A5FA' },
    light: { brand: '#16A34A', accent: '#D97706', error: '#DC2626', textPrimary: '#111827', textMuted: '#6B7280', borderActive: '#16A34A', borderIdle: '#E5E7EB', logoA: '#16A34A', logoB: '#2563EB' },
    none: { brand: '#FFFFFF', accent: '#FFFFFF', error: '#FFFFFF', textPrimary: '#FFFFFF', textMuted: '#FFFFFF', borderActive: '#FFFFFF', borderIdle: '#FFFFFF', logoA: '#FFFFFF', logoB: '#FFFFFF' },
    midnight: { brand: '#8B5CF6', accent: '#F59E0B', error: '#EF4444', textPrimary: '#E2E8F0', textMuted: '#64748B', borderActive: '#8B5CF6', borderIdle: '#1E293B', logoA: '#8B5CF6', logoB: '#60A5FA' },
    ocean: { brand: '#06B6D4', accent: '#F59E0B', error: '#EF4444', textPrimary: '#ECFEFF', textMuted: '#22D3EE', borderActive: '#06B6D4', borderIdle: '#164E63', logoA: '#06B6D4', logoB: '#7DD3FC' },
    solarized: { brand: '#859900', accent: '#CB4B16', error: '#DC322F', textPrimary: '#EEE8D5', textMuted: '#657B83', borderActive: '#859900', borderIdle: '#073642', logoA: '#268BD2', logoB: '#859900' },
    warm: { brand: '#F59E0B', accent: '#EF4444', error: '#DC2626', textPrimary: '#FEF3C7', textMuted: '#D97706', borderActive: '#F59E0B', borderIdle: '#1C0A00', logoA: '#F59E0B', logoB: '#EF4444' },
    'violet-storm': { brand: '#8B5CF6', accent: '#A78BFA', error: '#EF4444', textPrimary: '#EDE9FE', textMuted: '#A78BFA', borderActive: '#8B5CF6', borderIdle: '#1E1B4B', logoA: '#8B5CF6', logoB: '#A78BFA' },
    cosmic: { brand: '#FF006E', accent: '#FB5607', error: '#EF4444', textPrimary: '#FFFFFF', textMuted: '#FFBE0B', borderActive: '#FF006E', borderIdle: '#1A1A1A', logoA: '#FF006E', logoB: '#FB5607' },
    nord: { brand: '#88C0D0', accent: '#81A1C1', error: '#BF616A', textPrimary: '#ECEFF4', textMuted: '#4C566A', borderActive: '#88C0D0', borderIdle: '#2E3440', logoA: '#88C0D0', logoB: '#81A1C1' },
    ember: { brand: '#FF4500', accent: '#FFD700', error: '#DC2626', textPrimary: '#FFF176', textMuted: '#FF8C00', borderActive: '#FF4500', borderIdle: '#1A0F00', logoA: '#FF4500', logoB: '#FFD700' },
    sakura: { brand: '#C4306A', accent: '#FF85A1', error: '#EF4444', textPrimary: '#FFF0F3', textMuted: '#FF5C8D', borderActive: '#C4306A', borderIdle: '#1F000A', logoA: '#C4306A', logoB: '#FF85A1' },
    'obsidian-gold': { brand: '#C47C0A', accent: '#F5C518', error: '#EF4444', textPrimary: '#FFF8E7', textMuted: '#E8A015', borderActive: '#C47C0A', borderIdle: '#1A1100', logoA: '#C47C0A', logoB: '#F5C518' },
    crimson: { brand: '#C10023', accent: '#FF2952', error: '#DC143C', textPrimary: '#FFB3C1', textMuted: '#FF2952', borderActive: '#C10023', borderIdle: '#1A0005', logoA: '#C10023', logoB: '#FF2952' },
};
export function paletteFor(name) {
    if (name && name in PALETTES)
        return PALETTES[name];
    return PALETTES.dark;
}
/**
 * The 16-ANSI Theme each named theme maps to. `dark`/`light`/`none`
 * use their dedicated escape-code tables; everything else falls back
 * to dark — the visual differentiation lives in the hex palette and
 * is consumed by Ink components that opt into `paletteFor()`.
 */
export const themes = {
    dark: darkTheme,
    light: lightTheme,
    none: Object.fromEntries(Object.keys(darkTheme).map(k => [k, ''])),
    midnight: darkTheme,
    ocean: darkTheme,
    solarized: darkTheme,
    warm: darkTheme,
    'violet-storm': darkTheme,
    cosmic: darkTheme,
    nord: darkTheme,
    ember: darkTheme,
    sakura: darkTheme,
    'obsidian-gold': darkTheme,
    crimson: darkTheme,
};
/** Look up a theme by name; unknown names fall back to dark. */
export function getTheme(name) {
    if (name && name in themes)
        return themes[name];
    return darkTheme;
}
export function listThemes() {
    return Object.keys(themes);
}
export function style(token, text) {
    return `${token}${text}${RESET}`;
}
export function styleDim(text) {
    return style(defaultTheme.muted, text);
}
export function noColour() {
    return themes.none;
}
//# sourceMappingURL=theme.js.map