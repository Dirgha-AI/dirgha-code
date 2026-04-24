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

export type ThemeName = 'dark' | 'light' | 'none';

export const themes: Record<ThemeName, Theme> = {
  dark: darkTheme,
  light: lightTheme,
  none: Object.fromEntries(
    Object.keys(darkTheme).map(k => [k, '']),
  ) as unknown as Theme,
};

/** Look up a theme by name; unknown names fall back to dark. */
export function getTheme(name: string | undefined): Theme {
  if (name && name in themes) return themes[name as ThemeName];
  return darkTheme;
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
