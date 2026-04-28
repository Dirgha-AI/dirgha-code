/**
 * Inline markdown renderer.
 *
 * Parses a single line of markdown into styled segments and renders them
 * with ink's native <Text> props (bold/italic/underline/strikethrough/
 * color/backgroundColor) — no ANSI-string intermediate. Handles:
 *
 *   **bold**            *italic*    _italic_       ~~strike~~
 *   `inline code`       <u>under</u>
 *   [link text](url)    https://bare-urls.example
 *   ***bold-italic***
 *
 * Adapted from gemini-cli/packages/cli/src/ui/utils/markdownParsingUtils.ts
 * + InlineMarkdownRenderer.tsx (Apache-2.0). The parsing regex is preserved
 * verbatim; the renderer is dirgha-native (ink JSX rather than chalk ANSI).
 */
import * as React from 'react';
import type { Palette } from '../../theme.js';
interface InlineProps {
    text: string;
    palette: Palette;
    /** Override the base text colour. Defaults to palette.text.primary. */
    baseColor?: string;
    /** Used internally for nested calls so React keys stay unique. */
    keyPrefix?: string;
}
/** Render one or more lines of markdown text with inline emphasis. */
export declare function RenderInline(props: InlineProps): React.ReactElement;
export {};
