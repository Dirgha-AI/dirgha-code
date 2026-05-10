/**
 * Streaming assistant text block.
 *
 * Renders a chunk of already-accumulated text_delta content with full
 * markdown formatting (headings, lists, code fences, tables, inline
 * emphasis). The `✦` glyph in the gutter mirrors gemini-cli's
 * GeminiMessage — single-column prefix, wrap-friendly content beside.
 *
 * Use one instance per text span (a text span is a contiguous run
 * of text_delta between either thinking or tool events).
 */
import * as React from "react";
export interface StreamingTextProps {
    content: string;
}
export declare const StreamingText: React.NamedExoticComponent<StreamingTextProps>;
