/**
 * Self-contained spinner glyph component.
 *
 * All instances share a single module-level 80ms interval (one per process)
 * so invisible or off-screen instances do not waste CPU on redundant timers.
 * A global frame counter increments each tick; each component subscribes
 * and gates rendering on its `isActive` prop.
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
