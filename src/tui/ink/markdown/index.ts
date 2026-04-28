/**
 * Native markdown rendering for the Ink TUI.
 *
 * Replaces gemini-cli's lowlight-backed `MarkdownDisplay` with a
 * dependency-free port. Public surface:
 *
 *   <MarkdownDisplay text="# Hello\n\n- world" palette={p} />
 *
 * The orchestrator dispatches block kinds (heading / paragraph / code /
 * list / table / blockquote / rule) to dedicated renderers under the
 * same module. Inline emphasis is handled by `RenderInline`. Code
 * fences use the native `CodeColorizer` (regex tokenizers in `langs/`).
 */

export { MarkdownDisplay } from './display.js';
export { RenderInline } from './inline.js';
export { CodeColorizer } from './colorizer.js';
export { TableRenderer } from './table.js';
export { parse } from './parser.js';
export type { Block, ListItem } from './parser.js';
export { tokenize } from './langs/index.js';
export type { Token, TokenKind, Tokenizer } from './langs/types.js';
