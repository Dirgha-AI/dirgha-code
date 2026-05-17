import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Inline tool-approval prompt — Ink-native.
 *
 * Replaces the legacy `createTuiApprovalBus` (in `tui/approval.ts`),
 * which wrote the approval question directly to `process.stdout` and
 * read `process.stdin` raw. That approach worked OK on Linux but on
 * Windows the raw-mode handoff between Ink and the approval reader
 * hung — and on every platform the prompt was invisible because Ink's
 * differential renderer overdrew it on the next frame.
 *
 * This component renders inside the React tree like `ModelSwitchPrompt`,
 * so it participates in normal Ink layout. Keys are read via `useInput`
 * (no raw-mode contention) and the answer is reported via `onResolve`.
 */
import * as React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../theme-context.js';
function ApprovalPromptInner(props) {
    const palette = useTheme();
    const { request, onResolve } = props;
    useInput((ch, key) => {
        if (key.return) {
            onResolve('approve');
            return;
        } // default
        if (ch === 'y' || ch === 'Y') {
            onResolve('approve');
            return;
        }
        if (ch === 'n' || ch === 'N') {
            onResolve('deny');
            return;
        }
        if (ch === 'a' || ch === 'A') {
            onResolve('approve_once');
            return;
        }
        if (ch === 'd' || ch === 'D') {
            onResolve('deny_always');
            return;
        }
        if (key.escape) {
            onResolve('deny');
            return;
        }
    }, { isActive: true });
    const diffLines = request.diff?.split('\n') ?? [];
    const previewLines = diffLines.slice(0, 12);
    const truncated = diffLines.length > 12;
    return (_jsxs(Box, { marginY: 1, paddingX: 1, borderStyle: "round", borderColor: palette.status.warning, flexDirection: "column", children: [_jsxs(Box, { children: [_jsx(Text, { color: palette.status.warning, bold: true, children: "\u26A0 " }), _jsxs(Text, { color: palette.text.primary, children: [' ', "Approve ", _jsx(Text, { bold: true, children: request.tool }), "?"] })] }), request.summary && (_jsx(Box, { paddingLeft: 2, children: _jsx(Text, { color: palette.text.secondary, children: request.summary }) })), previewLines.length > 0 && (_jsxs(Box, { flexDirection: "column", paddingLeft: 2, marginTop: 1, children: [previewLines.map((line, i) => (_jsx(Text, { color: line.startsWith('+') ? palette.status.success
                            : line.startsWith('-') ? palette.status.error
                                : palette.text.secondary, children: line }, i))), truncated && (_jsxs(Text, { color: palette.text.secondary, dimColor: true, children: ["\u23BF (", diffLines.length - 12, " more lines hidden)"] }))] })), _jsx(Box, { marginTop: 1, children: _jsxs(Text, { color: palette.text.secondary, children: [' ', "[", _jsx(Text, { bold: true, color: palette.status.success, children: "y" }), "]es (default)", '  ', "[", _jsx(Text, { bold: true, color: palette.text.secondary, children: "n" }), "]o", '  ', "[", _jsx(Text, { bold: true, color: palette.text.accent, children: "a" }), "]lways for this session", '  ', "[", _jsx(Text, { bold: true, color: palette.status.error, children: "d" }), "]eny all"] }) })] }));
}
export const ApprovalPrompt = React.memo(ApprovalPromptInner);
//# sourceMappingURL=ApprovalPrompt.js.map