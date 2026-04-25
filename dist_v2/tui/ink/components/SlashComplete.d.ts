/**
 * Dropdown shown below the InputBox while the user is typing a
 * `/<command>` slash. Matches the built-in slash command list by
 * prefix first (most intuitive when the user types `/he` and expects
 * `/help`), then falls back to subsequence fuzzy match for typos.
 *
 * Contract with App/InputBox:
 *   - Parent renders this component when `query !== null`.
 *   - "query" is the substring after the leading `/` — empty string
 *     when the user has just typed `/` and nothing else (we show the
 *     full list in that case, like a command palette).
 *   - Parent calls `onPick(name)` with the bare command name (no
 *     leading slash) to splice the chosen command back into the input.
 *   - Parent calls `onCancel()` on Esc.
 *
 * Mirrors the structure of AtFileComplete — keyboard map (↑↓ tab/enter
 * esc), bordered Box, accent colour for selection.
 */
import * as React from 'react';
export interface SlashCommandEntry {
    name: string;
    description: string;
    aliases?: string[];
}
export interface SlashCompleteProps {
    commands: SlashCommandEntry[];
    query: string;
    onPick: (name: string) => void;
    onCancel: () => void;
}
export declare function SlashComplete(props: SlashCompleteProps): React.JSX.Element;
