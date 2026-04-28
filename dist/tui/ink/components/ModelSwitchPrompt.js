import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../theme-context.js';
export function ModelSwitchPrompt(props) {
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
//# sourceMappingURL=ModelSwitchPrompt.js.map