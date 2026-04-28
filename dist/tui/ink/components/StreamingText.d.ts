/**
 * Streaming assistant text block.
 *
 * Renders a chunk of already-accumulated text_delta content. Ink
 * handles wrapping; we only decorate with the brand glyph and
 * allocate width from the TTY. Use one instance per text span
 * (a text span is a contiguous run of text_delta between either
 * thinking or tool events).
 */
import * as React from 'react';
export interface StreamingTextProps {
    content: string;
}
export declare function StreamingText({ content }: StreamingTextProps): React.JSX.Element | null;
