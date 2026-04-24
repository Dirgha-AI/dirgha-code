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

export const defaultTheme: Theme = {
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

export function style(token: string, text: string): string {
  return `${token}${text}${RESET}`;
}

export function styleDim(text: string): string {
  return style(defaultTheme.muted, text);
}

export function noColour(): Theme {
  const empty = Object.fromEntries(
    Object.keys(defaultTheme).map(k => [k, '']),
  ) as unknown as Theme;
  return empty;
}
