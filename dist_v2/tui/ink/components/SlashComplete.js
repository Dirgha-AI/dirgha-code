import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * Dropdown shown below the InputBox while the user is typing a
 * `/<command>` slash. Matches the built-in slash command list by
 * prefix first (most intuitive when the user types `/he` and expects
 * `/help`), then falls back to subsequence fuzzy match for typos.
 *
 * Contract with App/InputBox:
 *   - Parent renders this component when `query !== null`.
 *   - "query" is the substring after the leading `/` — empty string
 *     when the user has just typed `/` and nothing else (we show the
 *     full list in that case, like a command palette).
 *   - Parent calls `onPick(name)` with the bare command name (no
 *     leading slash) to splice the chosen command back into the input.
 *   - Parent calls `onCancel()` on Esc.
 *
 * Mirrors the structure of AtFileComplete — keyboard map (↑↓ tab/enter
 * esc), bordered Box, accent colour for selection.
 */
import * as React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
const MAX_MATCHES = 10;
function rankCommand(entry, query) {
    if (query === '')
        return { ok: true, score: 0 };
    const q = query.toLowerCase();
    const candidates = [entry.name.toLowerCase(), ...(entry.aliases ?? []).map(a => a.toLowerCase())];
    // Prefix match wins (highest score).
    let best = -Infinity;
    let matched = false;
    for (const c of candidates) {
        if (c.startsWith(q)) {
            matched = true;
            // Closer-length-to-query → tighter prefix match → higher score.
            best = Math.max(best, 1000 - (c.length - q.length));
        }
    }
    if (matched)
        return { ok: true, score: best };
    // Fall back to subsequence fuzzy on the canonical name.
    const p = entry.name.toLowerCase();
    let pi = 0;
    let firstHit = -1;
    let lastHit = -1;
    let score = 0;
    for (let qi = 0; qi < q.length; qi += 1) {
        const target = q[qi];
        while (pi < p.length && p[pi] !== target)
            pi += 1;
        if (pi >= p.length)
            return { ok: false, score: 0 };
        if (firstHit === -1)
            firstHit = pi;
        if (lastHit !== -1)
            score -= pi - lastHit - 1;
        lastHit = pi;
        pi += 1;
    }
    score -= firstHit;
    return { ok: true, score };
}
export function SlashComplete(props) {
    const { stdout } = useStdout();
    const cols = stdout?.columns ?? 80;
    const width = Math.min(cols - 2, 70);
    const [cursor, setCursor] = React.useState(0);
    const matches = React.useMemo(() => {
        const scored = [];
        for (const cmd of props.commands) {
            const r = rankCommand(cmd, props.query);
            if (r.ok)
                scored.push({ name: cmd.name, description: cmd.description, score: r.score });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, MAX_MATCHES);
    }, [props.commands, props.query]);
    React.useEffect(() => {
        setCursor(c => Math.max(0, Math.min(c, matches.length - 1)));
    }, [matches.length]);
    useInput((_ch, key) => {
        if (key.escape) {
            props.onCancel();
            return;
        }
        if (key.upArrow) {
            setCursor(c => Math.max(0, c - 1));
            return;
        }
        if (key.downArrow) {
            setCursor(c => Math.min(matches.length - 1, c + 1));
            return;
        }
        if (key.tab || key.return) {
            const pick = matches[cursor];
            if (pick)
                props.onPick(pick.name);
        }
    });
    if (matches.length === 0) {
        return (_jsx(Box, { borderStyle: "single", borderColor: "gray", paddingX: 1, width: width, children: _jsxs(Text, { color: "gray", dimColor: true, children: ["no slash commands match /", props.query] }) }));
    }
    // Calculate name column width so descriptions line up.
    const nameWidth = Math.max(...matches.map(m => m.name.length)) + 1;
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "magenta", paddingX: 1, width: width, children: [_jsxs(Box, { justifyContent: "space-between", children: [_jsxs(Text, { color: "magenta", bold: true, children: ["/", props.query] }), _jsx(Text, { color: "gray", dimColor: true, children: "\u2191\u2193 \u00B7 tab/enter \u00B7 esc" })] }), matches.map((m, i) => (_jsxs(Box, { gap: 1, paddingLeft: 1, children: [_jsx(Text, { color: i === cursor ? 'magentaBright' : 'gray', children: i === cursor ? '>' : ' ' }), _jsx(Box, { width: nameWidth, children: _jsxs(Text, { color: i === cursor ? 'white' : 'cyan', bold: i === cursor, children: ["/", m.name] }) }), _jsx(Text, { color: i === cursor ? 'white' : 'gray', dimColor: i !== cursor, children: m.description })] }, m.name)))] }));
}
//# sourceMappingURL=SlashComplete.js.map