/**
 * Thinking block — Gemini CLI-style always-visible reasoning display.
 *
 * Thinking content is shown as a clean bubble: first line is a bold
 * summary heading, the remainder is in a left-bordered italic block.
 * Always visible — no toggle/collapse. During streaming the heading
 * updates live; after streaming the block stays visible for context.
 *
 * ThinkingBlockGroup merges 3+ consecutive blocks into single grouped rows.
 */
import * as React from "react";
export interface ThinkingBlockProps {
    content: string;
    isStreaming?: boolean;
}
export declare const ThinkingBlock: React.NamedExoticComponent<ThinkingBlockProps>;
export interface ThinkingBlockGroupProps {
    blocks: {
        id: string;
        content: string;
    }[];
}
export declare const ThinkingBlockGroup: React.NamedExoticComponent<ThinkingBlockGroupProps>;
