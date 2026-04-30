/**
 * Thinking block: dim italic render of reasoning tokens.
 *
 * Collapsed by default to a char-count summary (`thinking… (N chars)`)
 * to stop reasoning-heavy models from flooding the screen. Press Enter
 * (Return) on a collapsed block to expand it, Enter again to collapse.
 */
import * as React from "react";
export interface ThinkingBlockProps {
    content: string;
}
export declare function ThinkingBlock({ content, }: ThinkingBlockProps): React.JSX.Element | null;
