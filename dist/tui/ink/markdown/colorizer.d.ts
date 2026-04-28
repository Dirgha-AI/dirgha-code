/**
 * Code-fence colorizer.
 *
 * Tokenizes a code block via the native lexer (`./langs/`) and renders
 * the tokens with `<Text color={...}>` per kind. No alternate buffer,
 * no scroll viewer — that's a future enhancement. We just emit one
 * line per source line, padded with a left gutter so the code visually
 * separates from surrounding markdown text.
 *
 * Token-kind → palette mapping is centralised in `colorFor()` so theme
 * swaps work without touching this file.
 */
import * as React from 'react';
import type { Palette } from '../../theme.js';
interface ColorizerProps {
    code: string;
    lang: string | null;
    palette: Palette;
    /** Render line numbers in a left gutter. */
    showLineNumbers?: boolean;
    /** Cap visible lines (older content trimmed from top). */
    maxLines?: number;
}
export declare function CodeColorizer(props: ColorizerProps): React.ReactElement;
export {};
