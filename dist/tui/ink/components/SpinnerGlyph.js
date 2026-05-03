import { jsx as _jsx } from "react/jsx-runtime";
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
import { Text } from "ink";
import { SPINNER_FRAMES } from "../spinner-context.js";
const SPINNER_INTERVAL_MS = 80;
let GLOBAL_START = 0;
function computeFrame() {
    if (GLOBAL_START === 0)
        GLOBAL_START = Date.now();
    const elapsed = Date.now() - GLOBAL_START;
    return Math.floor(elapsed / SPINNER_INTERVAL_MS) % SPINNER_FRAMES.length;
}
export function SpinnerGlyph({ isActive, color, bold, }) {
    const [frame, setFrame] = React.useState(computeFrame);
    React.useEffect(() => {
        if (!isActive) {
            setFrame(0);
            return;
        }
        const t = setInterval(() => setFrame(computeFrame()), SPINNER_INTERVAL_MS);
        return () => clearInterval(t);
    }, [isActive]);
    return (_jsx(Text, { color: color, bold: bold, children: isActive
            ? (SPINNER_FRAMES[frame] ?? SPINNER_FRAMES[0])
            : SPINNER_FRAMES[0] }));
}
//# sourceMappingURL=SpinnerGlyph.js.map