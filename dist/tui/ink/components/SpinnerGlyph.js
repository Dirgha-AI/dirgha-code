import { jsx as _jsx } from "react/jsx-runtime";
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
import { Text } from "ink";
import { SPINNER_FRAMES } from "../spinner-context.js";
export function SpinnerGlyph({ isActive, color, bold, }) {
    const [frame, setFrame] = React.useState(0);
    React.useEffect(() => {
        if (!isActive) {
            setFrame(0);
            return;
        }
        const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
        return () => clearInterval(t);
    }, [isActive]);
    return (_jsx(Text, { color: color, bold: bold, children: SPINNER_FRAMES[frame] }));
}
//# sourceMappingURL=SpinnerGlyph.js.map