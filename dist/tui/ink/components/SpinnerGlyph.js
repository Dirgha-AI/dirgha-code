import { jsx as _jsx } from "react/jsx-runtime";
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
import { Text } from "ink";
import { SPINNER_FRAMES } from "../spinner-context.js";
const SPINNER_INTERVAL_MS = 80;
let _globalFrame = 0;
let _globalInterval = null;
const _subscribers = new Set();
function startGlobalInterval() {
    if (_globalInterval !== null)
        return;
    _globalInterval = setInterval(() => {
        _globalFrame = (_globalFrame + 1) % SPINNER_FRAMES.length;
        for (const notify of _subscribers)
            notify();
    }, SPINNER_INTERVAL_MS);
}
function stopGlobalInterval() {
    if (_globalInterval === null)
        return;
    clearInterval(_globalInterval);
    _globalInterval = null;
}
export function SpinnerGlyph({ isActive, color, bold, }) {
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
        if (!isActive) {
            _subscribers.delete(notify);
            return;
        }
        function notify() {
            setTick((n) => n + 1);
        }
        _subscribers.add(notify);
        startGlobalInterval();
        return () => {
            _subscribers.delete(notify);
            if (_subscribers.size === 0)
                stopGlobalInterval();
        };
    }, [isActive]);
    const frame = _globalFrame;
    return (_jsx(Text, { color: color, bold: bold, children: isActive
            ? (SPINNER_FRAMES[frame] ?? SPINNER_FRAMES[0])
            : SPINNER_FRAMES[0] }));
}
//# sourceMappingURL=SpinnerGlyph.js.map