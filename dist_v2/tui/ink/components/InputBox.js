import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Bottom-anchored prompt input.
 *
 * Uses `ink-text-input` for the editable field. Ctrl+C is handled here
 * (two presses within 1.5s exits) rather than relying on Ink's default
 * SIGINT so App can own the exit policy. Enter triggers onSubmit with
 * the trimmed value and clears the buffer.
 */
import * as React from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
const CTRL_C_TIMEOUT_MS = 1500;
export function InputBox(props) {
    const { stdout } = useStdout();
    const { exit } = useApp();
    const cols = stdout?.columns ?? 80;
    const [ctrlCArmed, setCtrlCArmed] = React.useState(false);
    const armTimerRef = React.useRef(null);
    React.useEffect(() => {
        return () => {
            if (armTimerRef.current)
                clearTimeout(armTimerRef.current);
        };
    }, []);
    useInput((_input, key) => {
        if (key.ctrl && _input === 'c') {
            if (ctrlCArmed) {
                exit();
                return;
            }
            setCtrlCArmed(true);
            if (armTimerRef.current)
                clearTimeout(armTimerRef.current);
            armTimerRef.current = setTimeout(() => setCtrlCArmed(false), CTRL_C_TIMEOUT_MS);
        }
    });
    const borderColour = props.busy ? 'cyan' : 'magenta';
    const promptColour = props.busy ? 'cyan' : 'magenta';
    return (_jsxs(Box, { flexDirection: "column", width: cols, children: [_jsx(Box, { borderStyle: "single", borderColor: borderColour, paddingX: 1, children: _jsxs(Box, { gap: 1, flexGrow: 1, children: [_jsx(Text, { color: promptColour, children: "\u276F" }), _jsx(TextInput, { value: props.value, onChange: props.onChange, onSubmit: props.onSubmit, placeholder: props.placeholder ?? 'Ask dirgha anything…', showCursor: !props.busy, focus: !props.busy })] }) }), ctrlCArmed && (_jsx(Box, { paddingX: 1, children: _jsx(Text, { color: "yellow", children: "Press Ctrl+C again to exit." }) }))] }));
}
//# sourceMappingURL=InputBox.js.map