import { jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { useTheme } from '../theme-context.js';
const MAX_VISIBLE = 3;
const TRUNCATE_AT = 80;
export function PromptQueueIndicator(props) {
    const palette = useTheme();
    if (props.queued.length === 0)
        return null;
    const visible = props.queued.slice(0, MAX_VISIBLE);
    const overflow = Math.max(0, props.queued.length - MAX_VISIBLE);
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, children: [_jsxs(Text, { color: palette.textMuted, children: ["queued (", props.queued.length, ") \u2014 runs after current turn"] }), visible.map((p, i) => (_jsxs(Text, { color: palette.textMuted, children: ['  ', "\u2022 ", truncate(p)] }, i))), overflow > 0 && (_jsxs(Text, { color: palette.textMuted, dimColor: true, children: ['  ', "+", overflow, " more"] }))] }));
}
function truncate(s) {
    const flat = s.replace(/\s+/g, ' ').trim();
    return flat.length <= TRUNCATE_AT ? flat : `${flat.slice(0, TRUNCATE_AT - 1)}…`;
}
//# sourceMappingURL=PromptQueueIndicator.js.map