/**
 * Thinking block: collapsible render of reasoning tokens.
 *
 * Collapsed by default to a one-line summary (`∇ thinking… (N chars)`)
 * to stop reasoning-heavy models from flooding the screen. Press Enter
 * or Space to toggle. Auto-expands during active streaming and
 * auto-collapses when the thinking span ends.
 *
 * ThinkingBlockGroup wraps 3+ consecutive thinking blocks in a single
 * collapsible accordion row.
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
