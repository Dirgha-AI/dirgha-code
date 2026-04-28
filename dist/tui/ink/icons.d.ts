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
export declare const BRAND_MARK = "\u25C8";
export declare const TOOL_ICONS: Record<string, string>;
export declare const DEFAULT_TOOL_ICON = "\u25C6";
export declare function iconFor(toolName: string): string;
/**
 * Symbols used in the agent transcript that aren't tools per se.
 */
export declare const TRANSCRIPT_GLYPHS: {
    readonly prompt: "❯";
    readonly thinking: "∇";
    readonly done: "∎";
    readonly ok: "✓";
    readonly error: "✗";
};
