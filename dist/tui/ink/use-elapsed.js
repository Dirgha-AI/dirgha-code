/**
 * Shared elapsed-time hook — replaces in-render Date.now() calls with a
 * single module-level 1s interval so that all live elapsed displays tick
 * together instead of each running their own timer.
 */
import * as React from "react";
let _tick = 0;
let _interval = null;
const _listeners = new Set();
function ensureTick() {
    if (_interval !== null)
        return;
    _interval = setInterval(() => {
        _tick++;
        for (const fn of _listeners)
            fn();
    }, 1000);
}
function formatElapsed(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60)
        return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}
export function useElapsed(startMs) {
    const [, forceUpdate] = React.useState(0);
    React.useEffect(() => {
        ensureTick();
        const listener = () => {
            forceUpdate((n) => n + 1);
        };
        _listeners.add(listener);
        return () => {
            _listeners.delete(listener);
            if (_listeners.size === 0 && _interval !== null) {
                clearInterval(_interval);
                _interval = null;
            }
        };
    }, []);
    const elapsed = Date.now() - startMs;
    return formatElapsed(elapsed);
}
//# sourceMappingURL=use-elapsed.js.map