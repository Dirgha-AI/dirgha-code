/**
 * Self-contained spinner glyph component.
 *
 * Owns its own 80ms interval so it re-renders in isolation — the rest of
 * the App tree (transcript, input, status bar) is NOT re-rendered on each
 * tick. Replaces the old `globalSpinnerFrame` useState + setInterval in
 * App.tsx that caused ~12.5 full-tree renders per second.
 *
 * Usage:
 *   <SpinnerGlyph isActive={busy} />
 */
import * as React from "react";
export interface SpinnerGlyphProps {
    isActive: boolean;
    color?: string;
    bold?: boolean;
}
export declare function SpinnerGlyph({ isActive, color, bold, }: SpinnerGlyphProps): React.JSX.Element;
