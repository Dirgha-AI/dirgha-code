/**
 * Self-contained spinner glyph component.
 *
 * Each instance runs its own 80ms interval so the rest of the App tree
 * is never re-rendered on spinner ticks. All instances share a module-level
 * start timestamp so they rotate in lockstep — no visual strobing when
 * multiple tools run simultaneously.
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
