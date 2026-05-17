import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Inline model-switch prompt.
 *
 * Renders below an error item when the kernel attached a `failoverModel`
 * suggestion. Three single-key answers:
 *   y → swap currentModel to the suggestion, retry the failed turn
 *   n → keep current model, surface the original error
 *   p → open the model picker so the user can pick anything
 *
 * Stays mounted only until a key is pressed; App removes it from state
 * after the choice resolves.
 */
import * as React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../theme-context.js';
function ModelSwitchPromptInner(props) {
    const palette = useTheme();
    useInput((ch, _key) => {
        if (ch === 'y' || ch === 'Y') {
            props.onAccept(props.failoverModel);
        }
        else if (ch === 'n' || ch === 'N') {
            props.onReject();
        }
        else if (ch === 'p' || ch === 'P') {
            props.onPicker();
        }
    }, { isActive: true });
    return (_jsxs(Box, { marginBottom: 1, paddingX: 1, borderStyle: "round", borderColor: palette.status.warning, flexDirection: "column", children: [_jsxs(Box, { children: [_jsx(Text, { color: palette.status.warning, bold: true, children: "! " }), _jsxs(Text, { color: palette.text.primary, children: [' ', _jsx(Text, { bold: true, children: props.failedModel }), " failed \u2014 try", ' ', _jsx(Text, { bold: true, color: palette.text.accent, children: props.failoverModel }), "?"] })] }), _jsx(Box, { children: _jsxs(Text, { color: palette.text.secondary, children: [' ', "[", _jsx(Text, { bold: true, color: palette.status.success, children: "y" }), "] yes", '  ', "[", _jsx(Text, { bold: true, color: palette.text.secondary, children: "n" }), "] no", '  ', "[", _jsx(Text, { bold: true, color: palette.text.accent, children: "p" }), "] picker"] }) })] }));
}
export const ModelSwitchPrompt = React.memo(ModelSwitchPromptInner);
//# sourceMappingURL=ModelSwitchPrompt.js.map