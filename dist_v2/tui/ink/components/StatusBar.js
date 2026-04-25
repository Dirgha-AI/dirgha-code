import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Status bar rendered below the input box.
 *
 * Left cluster: cwd basename + provider id.
 * Right cluster: model label + cumulative tokens + cost.
 * When busy, a subtle spinner frame appears on the right.
 */
import * as React from 'react';
import { Box, Text, useStdout } from 'ink';
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
function formatTokens(n) {
    if (n < 1000)
        return String(n);
    if (n < 1_000_000)
        return `${(n / 1000).toFixed(1)}k`;
    return `${(n / 1_000_000).toFixed(2)}M`;
}
function cwdLabel(cwd) {
    const parts = cwd.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? '~';
}
export function StatusBar(props) {
    const { stdout } = useStdout();
    const cols = stdout?.columns ?? 80;
    const [frame, setFrame] = React.useState(0);
    React.useEffect(() => {
        if (!props.busy)
            return;
        const t = setInterval(() => {
            setFrame(f => (f + 1) % SPINNER_FRAMES.length);
        }, 80);
        return () => clearInterval(t);
    }, [props.busy]);
    const totalTokens = props.inputTokens + props.outputTokens;
    const costLabel = props.costUsd > 0 ? `$${props.costUsd.toFixed(3)}` : '';
    const modelShort = props.model.length > 28 ? `${props.model.slice(0, 27)}…` : props.model;
    // Context meter: "12k/128k" — only renders when both ends are known.
    const contextMeter = props.contextWindow && props.contextWindow > 0 && totalTokens > 0
        ? `${formatTokens(totalTokens)}/${formatTokens(props.contextWindow)}`
        : '';
    // Mode badge: hidden when in default 'act'/'yolo' so the bar stays
    // quiet. YOLO is shown in red as a danger reminder.
    const modeBadge = props.mode && props.mode !== 'act' ? props.mode.toUpperCase() : '';
    const modeColour = props.mode === 'plan' ? 'yellow'
        : props.mode === 'verify' ? 'magenta'
            : props.mode === 'ask' ? 'cyan'
                : props.mode === 'yolo' ? 'red'
                    : 'gray';
    // Slim status bar — only what's load-bearing:
    //   left:  cwd · mode badge (when not 'act')
    //   right: spinner (when busy) · model · context-meter or cost
    // Drops: decorative dot, provider id (model name implies it),
    // /help hint, redundant token count when meter is present, tok/s.
    return (_jsxs(Box, { width: cols, paddingX: 1, justifyContent: "space-between", children: [_jsxs(Box, { gap: 1, children: [_jsx(Text, { color: "gray", children: cwdLabel(props.cwd) }), modeBadge !== '' && _jsxs(Text, { color: modeColour, bold: true, children: ["[", modeBadge, "]"] })] }), _jsxs(Box, { gap: 1, children: [props.busy && _jsx(Text, { color: "cyan", children: SPINNER_FRAMES[frame] }), _jsx(Text, { color: "cyan", children: modelShort }), contextMeter !== '' && _jsx(Text, { color: "gray", dimColor: true, children: contextMeter }), costLabel !== '' && _jsx(Text, { color: "gray", dimColor: true, children: costLabel })] })] }));
}
//# sourceMappingURL=StatusBar.js.map