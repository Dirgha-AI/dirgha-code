/**
 * Math-symbol glyph per built-in tool.
 *
 * Each glyph carries a small piece of meaning so a stream of tool calls
 * reads like a proof:
 *   ∴ fs_read      "therefore" — read in order to conclude
 *   ⊕ fs_write     "added"
 *   ⊕ fs_edit      "added (delta)"
 *   ▸ fs_ls        "expand"
 *   ~ search_grep  "matches"
 *   ~ search_glob  "matches"
 *   ∂ shell        "change" — partial derivative
 *   ≡ git          "equivalent" / commit identity
 *   ◇ checkpoint   "snapshot"
 *   @ browser      "remote"
 *   ⏚ cron         "scheduled" — earth/timer
 *   ⊞ task         "fan out" — sub-agent
 *
 * Plus the universal brand mark `◈` for the agent itself (used in
 * status lines, the prompt, and as the only non-text logo asset).
 *
 * Reference: `DESIGN.md:94` codifies `◈` as the brand glyph; this
 * file extends that with a per-tool set borrowed from the v1 renderer.
 */

export const BRAND_MARK = '◈';

export const TOOL_ICONS: Record<string, string> = {
  fs_read:     '∴',
  fs_write:    '⊕',
  fs_edit:     '⊕',
  fs_ls:       '▸',
  search_grep: '~',
  search_glob: '~',
  shell:       '∂',
  git:         '≡',
  git_commit:  '≡',
  checkpoint:  '◇',
  cron:        '⏚',
  browser:     '@',
  task:        '⊞',
  apply_patch: '∂',
};

export const DEFAULT_TOOL_ICON = '◆';

export function iconFor(toolName: string): string {
  return TOOL_ICONS[toolName] ?? DEFAULT_TOOL_ICON;
}

/**
 * Symbols used in the agent transcript that aren't tools per se.
 */
export const TRANSCRIPT_GLYPHS = {
  prompt: '❯',     // user-input line
  thinking: '∇',   // model reasoning step (nabla / gradient)
  done: '∎',       // QED tombstone, end of task
  ok: '✓',
  error: '✗',
} as const;

/**
 * Tool-call status glyphs. Mirror gemini-cli's TOOL_STATUS set so dirgha's
 * tool stream reads with the same lexicon. The executing glyph rotates
 * via a tiny spinner ring.
 *   o  pending — about to start
 *   ⊷  executing — model called the tool, waiting on result (spinner-paired)
 *   ✓  success — tool returned cleanly
 *   ✗  error — tool returned non-zero / threw
 *   ?  confirming — awaiting user approval
 *   -  canceled — aborted before it could run
 */
export const TOOL_STATUS = {
  PENDING: 'o',
  EXECUTING: '⊷',
  SUCCESS: '✓',
  ERROR: '✗',
  CONFIRMING: '?',
  CANCELED: '-',
} as const;

export type ToolStatusGlyph = (typeof TOOL_STATUS)[keyof typeof TOOL_STATUS];
