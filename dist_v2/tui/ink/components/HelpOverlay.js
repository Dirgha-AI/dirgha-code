import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Full-width modal overlay showing every available slash command plus
 * the TUI keyboard shortcuts.
 *
 * The command list is supplied as props so the caller decides whether
 * to feed it the built-in catalogue, the live `SlashRegistry.names()`
 * output, or a test-only stub. Shortcuts live here (they're TUI state,
 * not slash state).
 *
 * Navigation: type-to-filter, arrow keys or j/k to scroll, Esc / q to
 * close. Pure presentational; the parent owns visibility.
 */
import * as React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
const KEYBOARD_SHORTCUTS = [
    { key: 'Ctrl+C ×2', desc: 'exit' },
    { key: 'Ctrl+M', desc: 'model picker' },
    { key: 'Ctrl+H', desc: 'this help' },
    { key: '?', desc: 'help (when input empty)' },
    { key: 'Tab', desc: 'autocomplete @file' },
    { key: 'Ctrl+E', desc: 'expand / collapse pasted block' },
    { key: 'Esc', desc: 'close overlay · vim NORMAL mode' },
    { key: 'i', desc: 'vim INSERT mode' },
];
function inferGroup(name) {
    if (['help', 'exit', 'quit', 'clear', 'upgrade'].includes(name))
        return 'navigation';
    if (['login', 'logout', 'keys', 'account', 'setup'].includes(name))
        return 'auth';
    if (['session', 'resume', 'history', 'compact', 'memory'].includes(name))
        return 'session';
    if (['fleet', 'mode'].includes(name))
        return 'fleet';
    if (['model', 'models', 'theme', 'config', 'status', 'init'].includes(name))
        return 'config';
    if (['skills', 'cost'].includes(name))
        return 'tools';
    return 'other';
}
const GROUP_ORDER = [
    'navigation',
    'auth',
    'session',
    'config',
    'fleet',
    'tools',
    'other',
];
const GROUP_TITLES = {
    navigation: 'Navigation',
    auth: 'Auth & Keys',
    session: 'Session & Memory',
    config: 'Model & Config',
    fleet: 'Fleet & Modes',
    tools: 'Tools & Skills',
    other: 'Other',
};
export function HelpOverlay(props) {
    const { stdout } = useStdout();
    const cols = stdout?.columns ?? 80;
    const rows = stdout?.rows ?? 24;
    const width = Math.min(cols - 2, 100);
    const [filter, setFilter] = React.useState('');
    const [scroll, setScroll] = React.useState(0);
    useInput((input, key) => {
        if (key.escape || input === 'q') {
            props.onClose();
            return;
        }
        if (key.backspace || key.delete) {
            setFilter(f => f.slice(0, -1));
            setScroll(0);
            return;
        }
        if (key.downArrow || input === 'j') {
            setScroll(s => s + 1);
            return;
        }
        if (key.upArrow || input === 'k') {
            setScroll(s => Math.max(0, s - 1));
            return;
        }
        if (key.pageDown) {
            setScroll(s => s + 10);
            return;
        }
        if (key.pageUp) {
            setScroll(s => Math.max(0, s - 10));
            return;
        }
        if (!key.ctrl && !key.meta && input && input.length === 1 && input >= ' ') {
            setFilter(f => f + input);
            setScroll(0);
        }
    });
    const q = filter.trim().toLowerCase();
    const filtered = props.slashCommands.filter(c => q === '' || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
    const byGroup = new Map();
    for (const c of filtered) {
        const g = c.group ?? inferGroup(c.name);
        const list = byGroup.get(g) ?? [];
        list.push(c);
        byGroup.set(g, list);
    }
    const lines = [];
    for (const group of GROUP_ORDER) {
        const cmds = byGroup.get(group);
        if (!cmds || cmds.length === 0)
            continue;
        cmds.sort((a, b) => a.name.localeCompare(b.name));
        lines.push(_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: "magenta", bold: true, children: GROUP_TITLES[group] ?? group }) }, `h-${group}`));
        for (const c of cmds) {
            lines.push(_jsxs(Box, { gap: 2, children: [_jsxs(Text, { color: "cyan", children: ["/", c.name.padEnd(14)] }), _jsx(Text, { color: "gray", children: c.description })] }, `c-${c.name}`));
        }
    }
    // Shortcut block always visible — append after command lines.
    lines.push(_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: "magenta", bold: true, children: "Keyboard" }) }, "kb-h"));
    for (const kb of KEYBOARD_SHORTCUTS) {
        lines.push(_jsxs(Box, { gap: 2, children: [_jsx(Text, { color: "yellow", children: kb.key.padEnd(14) }), _jsx(Text, { color: "gray", children: kb.desc })] }, `kb-${kb.key}`));
    }
    const maxVisible = Math.max(5, rows - 10);
    const visible = lines.slice(scroll, scroll + maxVisible);
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "magenta", paddingX: 1, width: width, children: [_jsxs(Box, { gap: 1, justifyContent: "space-between", children: [_jsxs(Box, { gap: 1, children: [_jsx(Text, { color: "magenta", bold: true, children: "help" }), _jsxs(Text, { color: "gray", dimColor: true, children: [filtered.length, " command", filtered.length === 1 ? '' : 's', filter !== '' ? ` · filter: "${filter}"` : ''] })] }), _jsx(Text, { color: "gray", dimColor: true, children: "type to filter \u00B7 \u2191\u2193 \u00B7 esc" })] }), visible.length === 0
                ? _jsxs(Text, { color: "gray", dimColor: true, children: ["No commands match \"", filter, "\""] })
                : _jsx(_Fragment, { children: visible }), lines.length > maxVisible && (_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: "gray", dimColor: true, children: scroll + maxVisible < lines.length
                        ? `↓ ${lines.length - scroll - maxVisible} more below`
                        : '· end ·' }) }))] }));
}
//# sourceMappingURL=HelpOverlay.js.map