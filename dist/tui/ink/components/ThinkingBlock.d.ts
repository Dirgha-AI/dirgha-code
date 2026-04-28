/**
 * Thinking block: dim italic render of reasoning tokens.
 *
 * Collapsed by default to a char-count summary (`thinking… (N chars)`)
 * to stop reasoning-heavy models from flooding the screen. Pass
 * `expanded` to dump the full content instead.
 */
import * as React from 'react';
export interface ThinkingBlockProps {
    content: string;
    expanded?: boolean;
}
export declare function ThinkingBlock({ content, expanded }: ThinkingBlockProps): React.JSX.Element | null;
