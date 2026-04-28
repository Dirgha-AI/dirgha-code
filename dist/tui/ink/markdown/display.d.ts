/**
 * Top-level markdown renderer.
 *
 * Parses arbitrary markdown text and renders each block with the
 * appropriate component (heading / paragraph / code / list / rule /
 * table / blockquote). Inline emphasis runs via `RenderInline`; code
 * fences run through the native `CodeColorizer`; tables run through
 * `TableRenderer`.
 *
 * Visual conventions (mirroring gemini-cli):
 *   #  → bold accent
 *   ## → bold accent + dim accent prefix line
 *   ### / #### → bold primary
 *   - / * / + → bullets with `•`/`◦`/`▪` per nesting depth
 *   1. 2. 3. → numbers right-aligned in a 2-col gutter
 *   > quote → left-bar + dim italic
 *   --- → horizontal rule
 *   ``` lang → bordered code block, syntax-highlighted
 */
import * as React from 'react';
import type { Palette } from '../../theme.js';
interface MarkdownProps {
    text: string;
    palette: Palette;
    /** Available width for cell-based layouts (table). Defaults to 80. */
    width?: number;
}
export declare function MarkdownDisplay(props: MarkdownProps): React.ReactElement | null;
export {};
