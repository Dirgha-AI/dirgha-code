/**
 * ANSI colour tokens. Scoped to what the TUI actually uses — no
 * overreach into a full style system. Callers wrap strings via style().
 */

const RESET = '\x1b[0m';

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

// Dark palette — tuned for dark terminal backgrounds.
export const darkTheme: Theme = {
  userPrompt: '\x1b[1;36m',   // bold cyan
  assistant: '\x1b[0m',       // plain
  thinking: '\x1b[2;37m',     // dim grey
  tool: '\x1b[35m',           // magenta
  toolError: '\x1b[31m',      // red
  systemNotice: '\x1b[33m',   // yellow
  muted: '\x1b[2m',
  accent: '\x1b[1;34m',
  warning: '\x1b[33m',
  danger: '\x1b[31m',
  success: '\x1b[32m',
};

// Light palette — swaps dim/bright so white terminals stay legible.
export const lightTheme: Theme = {
  userPrompt: '\x1b[1;34m',   // bold blue (cyan washes out on light)
  assistant: '\x1b[0m',
  thinking: '\x1b[2;30m',     // dim black (not grey)
  tool: '\x1b[35m',
  toolError: '\x1b[1;31m',    // bold red so it pops
  systemNotice: '\x1b[33m',
  muted: '\x1b[2;30m',
  accent: '\x1b[1;34m',
  warning: '\x1b[1;33m',
  danger: '\x1b[1;31m',
  success: '\x1b[1;32m',
};

// Backward-compat alias — existing call sites use `defaultTheme`.
export const defaultTheme: Theme = darkTheme;

export type ThemeName =
  | 'readable' | 'dark' | 'light' | 'none'
  | 'midnight' | 'ocean' | 'solarized' | 'warm'
  | 'violet-storm' | 'cosmic' | 'nord' | 'ember'
  | 'sakura' | 'obsidian-gold' | 'crimson'
  // Ports from gemini-cli (Apache-2.0). Original colour palettes preserved;
  // only the token shape was adapted to dirgha's Palette / SemanticColors.
  | 'dracula' | 'github-dark' | 'tokyonight' | 'atom-one-dark' | 'ayu-dark';

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
/**
 * Semantic colour tokens — gemini-cli style. Use these for new components.
 * Group meaning rather than role:
 *   text.*       — content; primary > secondary > accent
 *   status.*     — pass/warn/fail signalling
 *   ui.*         — chrome elements (active state, dim separators, comments)
 *   border.*     — frame chrome
 *   background.* — fill (rendered as colour-by-bg in supported terminals)
 * Each named theme provides a SemanticColors block; the legacy flat
 * `Palette` keys (brand/accent/textPrimary/...) are projected from these
 * so existing call sites keep working through the migration.
 */
export interface SemanticColors {
  text: {
    primary: string;
    secondary: string;
    accent: string;
    link: string;
    response: string;
  };
  status: {
    success: string;
    warning: string;
    error: string;
  };
  ui: {
    active: string;
    comment: string;
    symbol: string;
    focus: string;
    dark: string;
    /** Optional gradient pair for logo / banner art. */
    gradient?: [string, string];
  };
  border: {
    default: string;
  };
  background: {
    primary: string;
    diff: { added: string; removed: string };
  };
}

/** Legacy flat palette. New code should reach for SemanticColors via Palette.text/.status/.ui. */
export interface Palette extends SemanticColors {
  /** @deprecated use ui.focus or status.success */
  brand: string;
  /** @deprecated use text.accent */
  accent: string;
  /** @deprecated use status.error */
  error: string;
  /** @deprecated use text.primary */
  textPrimary: string;
  /** @deprecated use text.secondary */
  textMuted: string;
  /** @deprecated use ui.active */
  borderActive: string;
  /** @deprecated use border.default */
  borderIdle: string;
  logoA: string;
  logoB: string;
}

/**
 * Compact theme builder — one row per palette, semantic tokens explicit.
 * Args:
 *   t = [primary, secondary, accent] text colours
 *   s = [success, warning, error] status colours
 *   u = [active, comment, symbol, focus, dark] ui chrome
 *   b = border-default
 *   bg = [primary, diffAdded, diffRemoved] background colours
 *   logo = [logoA, logoB] gradient pair
 */
function buildPalette(
  t: [string, string, string],
  s: [string, string, string],
  u: [string, string, string, string, string],
  b: string,
  bg: [string, string, string],
  logo: [string, string],
  link?: string,
): Palette {
  const [primary, secondary, accent] = t;
  const [success, warning, error] = s;
  const [active, comment, symbol, focus, dark] = u;
  const [bgPrimary, diffAdded, diffRemoved] = bg;
  return {
    text: { primary, secondary, accent, link: link ?? active, response: primary },
    status: { success, warning, error },
    ui: { active, comment, symbol, focus, dark, gradient: logo },
    border: { default: b },
    background: { primary: bgPrimary, diff: { added: diffAdded, removed: diffRemoved } },
    // Legacy flat aliases:
    brand: focus,
    accent,
    error,
    textPrimary: primary,
    textMuted: secondary,
    borderActive: active,
    borderIdle: b,
    logoA: logo[0],
    logoB: logo[1],
  };
}

export const PALETTES: Record<ThemeName, Palette> = {
  // Default. Tuned for legibility on common terminal backgrounds —
  // muted text stays above WCAG AA (~5.9:1 on #1F2937), border-idle
  // visible without dominating, accent + brand differentiate without
  // alarming. Replaces `dark` as the on-boot default.
  readable: buildPalette(
    ['#F3F4F6', '#9CA3AF', '#FCD34D'],
    ['#22C55E', '#FCD34D', '#F87171'],
    ['#5EEAD4', '#6B7280', '#9CA3AF', '#5EEAD4', '#1F2937'],
    '#374151',
    ['#0F172A', '#15803D', '#991B1B'],
    ['#5EEAD4', '#A78BFA'],
    '#60A5FA',
  ),
  dark: buildPalette(
    ['#E5E7EB', '#9CA3AF', '#F59E0B'],
    ['#22C55E', '#F59E0B', '#EF4444'],
    ['#22C55E', '#6B7280', '#9CA3AF', '#22C55E', '#1F2937'],
    '#374151',
    ['#0F172A', '#15803D', '#991B1B'],
    ['#22C55E', '#60A5FA'],
  ),
  light: buildPalette(
    ['#111827', '#6B7280', '#D97706'],
    ['#16A34A', '#D97706', '#DC2626'],
    ['#16A34A', '#6B7280', '#374151', '#16A34A', '#9CA3AF'],
    '#E5E7EB',
    ['#FFFFFF', '#D1FAE5', '#FECACA'],
    ['#16A34A', '#2563EB'],
  ),
  none: buildPalette(
    ['#FFFFFF', '#FFFFFF', '#FFFFFF'],
    ['#FFFFFF', '#FFFFFF', '#FFFFFF'],
    ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'],
    '#FFFFFF',
    ['#000000', '#FFFFFF', '#FFFFFF'],
    ['#FFFFFF', '#FFFFFF'],
  ),
  midnight: buildPalette(
    ['#E2E8F0', '#64748B', '#F59E0B'],
    ['#22C55E', '#F59E0B', '#EF4444'],
    ['#8B5CF6', '#475569', '#94A3B8', '#8B5CF6', '#1E293B'],
    '#1E293B',
    ['#020617', '#14532D', '#7F1D1D'],
    ['#8B5CF6', '#60A5FA'],
  ),
  ocean: buildPalette(
    ['#ECFEFF', '#22D3EE', '#F59E0B'],
    ['#22C55E', '#F59E0B', '#EF4444'],
    ['#06B6D4', '#0E7490', '#67E8F9', '#06B6D4', '#164E63'],
    '#164E63',
    ['#042F2E', '#14532D', '#7F1D1D'],
    ['#06B6D4', '#7DD3FC'],
  ),
  solarized: buildPalette(
    ['#EEE8D5', '#657B83', '#CB4B16'],
    ['#859900', '#B58900', '#DC322F'],
    ['#859900', '#586E75', '#93A1A1', '#268BD2', '#073642'],
    '#073642',
    ['#002B36', '#3F4D2E', '#5C2424'],
    ['#268BD2', '#859900'],
  ),
  warm: buildPalette(
    ['#FEF3C7', '#D97706', '#EF4444'],
    ['#84CC16', '#F59E0B', '#DC2626'],
    ['#F59E0B', '#92400E', '#FBBF24', '#F59E0B', '#1C0A00'],
    '#1C0A00',
    ['#1C0A00', '#3F2C00', '#3F0A0A'],
    ['#F59E0B', '#EF4444'],
  ),
  'violet-storm': buildPalette(
    ['#EDE9FE', '#A78BFA', '#A78BFA'],
    ['#22C55E', '#FBBF24', '#EF4444'],
    ['#8B5CF6', '#5B21B6', '#C4B5FD', '#8B5CF6', '#1E1B4B'],
    '#1E1B4B',
    ['#0F0A2A', '#14532D', '#7F1D1D'],
    ['#8B5CF6', '#A78BFA'],
  ),
  cosmic: buildPalette(
    ['#FFFFFF', '#FFBE0B', '#FB5607'],
    ['#3A86FF', '#FFBE0B', '#FF006E'],
    ['#FF006E', '#8338EC', '#FFBE0B', '#FF006E', '#1A1A1A'],
    '#1A1A1A',
    ['#000000', '#10B981', '#EF4444'],
    ['#FF006E', '#FB5607'],
  ),
  nord: buildPalette(
    ['#ECEFF4', '#4C566A', '#81A1C1'],
    ['#A3BE8C', '#EBCB8B', '#BF616A'],
    ['#88C0D0', '#4C566A', '#81A1C1', '#88C0D0', '#2E3440'],
    '#2E3440',
    ['#2E3440', '#3F4D2E', '#5C2424'],
    ['#88C0D0', '#81A1C1'],
  ),
  ember: buildPalette(
    ['#FFF176', '#FF8C00', '#FFD700'],
    ['#84CC16', '#FFD700', '#DC2626'],
    ['#FF4500', '#92400E', '#FBBF24', '#FF4500', '#1A0F00'],
    '#1A0F00',
    ['#1A0F00', '#3F2C00', '#3F0A0A'],
    ['#FF4500', '#FFD700'],
  ),
  sakura: buildPalette(
    ['#FFF0F3', '#FF5C8D', '#FF85A1'],
    ['#22C55E', '#FBBF24', '#EF4444'],
    ['#C4306A', '#831843', '#FBCFE8', '#C4306A', '#1F000A'],
    '#1F000A',
    ['#1F000A', '#14532D', '#7F1D1D'],
    ['#C4306A', '#FF85A1'],
  ),
  'obsidian-gold': buildPalette(
    ['#FFF8E7', '#E8A015', '#F5C518'],
    ['#84CC16', '#F5C518', '#EF4444'],
    ['#C47C0A', '#78350F', '#FBBF24', '#C47C0A', '#1A1100'],
    '#1A1100',
    ['#1A1100', '#3F2C00', '#3F0A0A'],
    ['#C47C0A', '#F5C518'],
  ),
  crimson: buildPalette(
    ['#FFB3C1', '#FF2952', '#FF2952'],
    ['#84CC16', '#FBBF24', '#DC143C'],
    ['#C10023', '#7F1D1D', '#FBA5B5', '#C10023', '#1A0005'],
    '#1A0005',
    ['#1A0005', '#14532D', '#7F1D1D'],
    ['#C10023', '#FF2952'],
  ),
  // ─────────────────────────────────────────────────────────────────
  // Ports from gemini-cli (Apache-2.0). Original colour palettes
  // preserved — only the token shape was adapted to dirgha's schema.
  // Sources: gemini-cli/packages/cli/src/ui/themes/builtin/dark/*.ts
  // ─────────────────────────────────────────────────────────────────
  dracula: buildPalette(
    ['#a3afb7', '#6272a4', '#ff79c6'],          // text: primary, secondary, accent
    ['#50fa7b', '#fff783', '#ff5555'],          // status: success, warning, error
    ['#8be9fd', '#6272a4', '#a3afb7', '#ff79c6', '#44475a'], // ui: active, comment, symbol, focus, dark
    '#44475a',                                  // border
    ['#282a36', '#11431d', '#6e1818'],          // background: primary, diffAdded, diffRemoved
    ['#ff79c6', '#8be9fd'],                     // logo gradient
    '#8be9fd',                                  // link
  ),
  'github-dark': buildPalette(
    ['#c0c4c8', '#6A737D', '#79B8FF'],
    ['#85E89D', '#FFAB70', '#F97583'],
    ['#79B8FF', '#6A737D', '#c0c4c8', '#B392F0', '#444c56'],
    '#444c56',
    ['#24292e', '#3C4636', '#502125'],
    ['#79B8FF', '#85E89D'],
    '#79B8FF',
  ),
  tokyonight: buildPalette(
    ['#c0caf5', '#565f89', '#bb9af7'],
    ['#9ece6a', '#e0af68', '#f7768e'],
    ['#7aa2f7', '#565f89', '#a9b1d6', '#bb9af7', '#3b4261'],
    '#3b4261',
    ['#1a1b26', '#1c3328', '#3c1e2a'],
    ['#bb9af7', '#7aa2f7'],
    '#7aa2f7',
  ),
  'atom-one-dark': buildPalette(
    ['#abb2bf', '#5c6370', '#c678dd'],
    ['#98c379', '#e6c07b', '#e06c75'],
    ['#61aeee', '#5c6370', '#abb2bf', '#c678dd', '#3e4451'],
    '#3e4451',
    ['#282c34', '#1c3328', '#3c1e2a'],
    ['#c678dd', '#61aeee'],
    '#61aeee',
  ),
  'ayu-dark': buildPalette(
    ['#aeaca6', '#646A71', '#D2A6FF'],
    ['#AAD94C', '#FFB454', '#F26D78'],
    ['#39BAE6', '#646A71', '#aeaca6', '#D2A6FF', '#3D4149'],
    '#3D4149',
    ['#0b0e14', '#1c3328', '#3c1e2a'],
    ['#D2A6FF', '#39BAE6'],
    '#39BAE6',
  ),
};

export function paletteFor(name: string | undefined): Palette {
  if (name && name in PALETTES) return PALETTES[name as ThemeName];
  return PALETTES.dark;
}

/**
 * The 16-ANSI Theme each named theme maps to. `dark`/`light`/`none`
 * use their dedicated escape-code tables; everything else falls back
 * to dark — the visual differentiation lives in the hex palette and
 * is consumed by Ink components that opt into `paletteFor()`.
 */
export const themes: Record<ThemeName, Theme> = {
  readable: darkTheme,
  dark: darkTheme,
  light: lightTheme,
  none: Object.fromEntries(
    Object.keys(darkTheme).map(k => [k, '']),
  ) as unknown as Theme,
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
  dracula: darkTheme,
  'github-dark': darkTheme,
  tokyonight: darkTheme,
  'atom-one-dark': darkTheme,
  'ayu-dark': darkTheme,
};

/** Look up a theme by name; unknown names fall back to dark. */
export function getTheme(name: string | undefined): Theme {
  if (name && name in themes) return themes[name as ThemeName];
  return darkTheme;
}

export function listThemes(): ThemeName[] {
  return Object.keys(themes) as ThemeName[];
}

export function style(token: string, text: string): string {
  return `${token}${text}${RESET}`;
}

export function styleDim(text: string): string {
  return style(defaultTheme.muted, text);
}

export function noColour(): Theme {
  return themes.none;
}
