import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * Status bar rendered below the input box.
 *
 * Left cluster: cwd basename + provider id.
 * Right cluster: model label + cumulative tokens + cost.
 * When busy, a subtle spinner frame appears on the right.
 */
import * as React from "react";
import { Box, Text, useStdout } from "ink";
import { useTheme } from "../theme-context.js";
import { SpinnerContext, SPINNER_FRAMES } from "../spinner-context.js";
function formatTokens(n) {
    if (n < 1000)
        return String(n);
    if (n < 1_000_000)
        return `${(n / 1000).toFixed(1)}k`;
    return `${(n / 1_000_000).toFixed(2)}M`;
}
function cwdLabel(cwd) {
    const parts = cwd.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "~";
}
// Drop the provider prefix from a model id so the footer reads short
// and human. e.g. `moonshotai/kimi-k2-instruct` → `kimi-k2-instruct`,
// `accounts/fireworks/models/deepseek-v3` → `deepseek-v3`.
function shortModel(model) {
    const slash = model.lastIndexOf("/");
    return slash === -1 ? model : model.slice(slash + 1);
}
function modeStyle(mode) {
    switch (mode) {
        case "yolo":
            return { label: "YOLO", symbol: "⏵⏵" };
        case "plan":
            return { label: "PLAN", symbol: "◔" };
        case "verify":
            return { label: "VERIFY", symbol: "✓" };
        case "ask":
            return { label: "ASK", symbol: "?" };
        case "act":
        default:
            return { label: "ACT", symbol: "▸" };
    }
}
export function StatusBar(props) {
    const { stdout } = useStdout();
    const palette = useTheme();
    const cols = stdout?.columns ?? 80;
    const frame = React.useContext(SpinnerContext);
    const totalTokens = props.inputTokens + props.outputTokens;
    const costLabel = props.costUsd > 0 ? `$${props.costUsd.toFixed(3)}` : "";
    // Strip provider prefix so the footer reads short and human.
    const modelDisplay = (() => {
        const s = shortModel(props.model);
        return s.length > 28 ? `${s.slice(0, 27)}…` : s;
    })();
    // Context meter: "12k/128k" — only renders when both ends are known.
    const contextMeter = props.contextWindow && props.contextWindow > 0 && totalTokens > 0
        ? `${formatTokens(totalTokens)}/${formatTokens(props.contextWindow)}`
        : "";
    // tok/s readout — only meaningful while a turn is streaming AND we
    // have at least one token + non-zero elapsed time. Below 250ms we'd
    // get extreme rates from a single chunk, so suppress until warmed up.
    const tokRateLabel = (() => {
        const t = props.liveOutputTokens;
        const ms = props.liveDurationMs;
        if (!props.busy)
            return "";
        if (typeof t !== "number" || typeof ms !== "number")
            return "";
        if (t <= 0 || ms <= 0)
            return "";
        if (ms < 250)
            return ""; // warmup: avoid spurious 1000+ tok/s readings
        const rate = Math.round((t / ms) * 1000);
        return `${rate} tok/s`;
    })();
    // Mode badge: ALWAYS visible so the user knows what posture the
    // agent is in. YOLO surfaces in the palette's error colour as a
    // danger reminder; PLAN/ASK in accent; ACT in muted to stay calm.
    const mode = props.mode ?? "act";
    const ms = modeStyle(mode);
    const modeColour = mode === "plan"
        ? palette.accent
        : mode === "verify"
            ? palette.brand
            : mode === "ask"
                ? palette.brand
                : mode === "yolo"
                    ? palette.error
                    : palette.textMuted;
    // Slim status bar — only what's load-bearing:
    //   left:  ⏵⏵ MODE · cwd
    //   right: spinner (when busy) · short model · context-meter or cost
    return (_jsxs(Box, { width: cols, paddingX: 1, justifyContent: "space-between", children: [_jsxs(Box, { gap: 1, children: [_jsxs(Text, { color: modeColour, bold: true, children: [ms.symbol, " ", ms.label] }), _jsx(Text, { color: palette.textMuted, dimColor: true, children: "\u00B7" }), _jsx(Text, { color: palette.textMuted, children: cwdLabel(props.cwd) })] }), _jsxs(Box, { gap: 1, children: [props.busy && (_jsx(Text, { color: palette.brand, children: SPINNER_FRAMES[frame] })), typeof props.turnCount === "number" &&
                        typeof props.maxTurns === "number" && (_jsx(Text, { color: palette.textMuted, dimColor: true, children: `Turn ${props.turnCount}/${props.maxTurns}` })), _jsx(Text, { color: palette.brand, children: modelDisplay }), props.busy && (_jsx(Text, { color: palette.textMuted, dimColor: true, children: "\u00B7 Ctrl+C to stop" })), tokRateLabel !== "" && (_jsx(Text, { color: palette.textMuted, dimColor: true, children: tokRateLabel })), contextMeter !== "" && (_jsx(Text, { color: palette.textMuted, dimColor: true, children: contextMeter })), costLabel !== "" && (_jsx(Text, { color: palette.textMuted, dimColor: true, children: costLabel }))] })] }));
}
//# sourceMappingURL=StatusBar.js.map