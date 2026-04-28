import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * Dropdown shown below the InputBox while the user is typing an
 * `@…` file reference. The list is fuzzy-matched against a cached
 * snapshot of the working tree (walked once on first open).
 *
 * Contract with App/InputBox:
 *   - Parent renders this component when `query !== null`.
 *   - Parent extracts the query token itself (substring after last `@`).
 *   - Parent calls `onPick(path)` to splice the chosen path back into
 *     the input buffer, replacing the `@query` segment.
 *   - Parent calls `onCancel()` on Esc.
 *
 * Matching: a simple subsequence filter — every character of the
 * query must appear in the candidate in order, case-insensitive.
 * Score = negative distance between matched positions, so tight
 * matches float to the top.
 */
import * as React from 'react';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Box, Text, useInput, useStdout } from 'ink';
import { useTheme } from '../theme-context.js';
const IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    '.next',
    '.turbo',
    '.cache',
    'dist',
    'build',
    'coverage',
    '.pnpm-store',
    '.venv',
    '.mypy_cache',
    '.ruff_cache',
    '.pytest_cache',
    '__pycache__',
]);
const MAX_MATCHES = 8;
const MAX_WALK_ENTRIES = 5000;
function fuzzyMatch(path, query) {
    if (query === '')
        return { ok: true, score: 0 };
    const p = path.toLowerCase();
    const q = query.toLowerCase();
    let pi = 0;
    let lastHit = -1;
    let firstHit = -1;
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
    // Bonus for matching near the start.
    score -= firstHit;
    return { ok: true, score };
}
async function walk(root, budget = MAX_WALK_ENTRIES) {
    const out = [];
    const queue = [root];
    while (queue.length > 0 && out.length < budget) {
        const dir = queue.shift();
        if (dir === undefined)
            break;
        const names = await readdir(dir).catch(() => []);
        for (const name of names) {
            if (name.startsWith('.') && name !== '.env')
                continue;
            if (IGNORED_DIRS.has(name))
                continue;
            const full = join(dir, name);
            const info = await stat(full).catch(() => undefined);
            if (!info)
                continue;
            if (info.isDirectory()) {
                queue.push(full);
            }
            else if (info.isFile()) {
                out.push(relative(root, full));
                if (out.length >= budget)
                    break;
            }
        }
    }
    return out;
}
export function AtFileComplete(props) {
    const { stdout } = useStdout();
    const palette = useTheme();
    const cols = stdout?.columns ?? 80;
    const width = Math.min(cols - 2, 70);
    const [index, setIndex] = React.useState(null);
    const [cursor, setCursor] = React.useState(0);
    const [error, setError] = React.useState(null);
    React.useEffect(() => {
        let cancelled = false;
        walk(props.cwd)
            .then(paths => { if (!cancelled)
            setIndex(paths); })
            .catch(err => { if (!cancelled)
            setError(err instanceof Error ? err.message : String(err)); });
        return () => { cancelled = true; };
    }, [props.cwd]);
    const matches = React.useMemo(() => {
        if (index === null)
            return [];
        const scored = [];
        for (const p of index) {
            const m = fuzzyMatch(p, props.query);
            if (m.ok)
                scored.push({ path: p, score: m.score });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, MAX_MATCHES);
    }, [index, props.query]);
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
                props.onPick(pick.path);
        }
    });
    if (error !== null) {
        return (_jsx(Box, { borderStyle: "single", borderColor: palette.error, paddingX: 1, width: width, children: _jsxs(Text, { color: palette.error, children: ["walk failed: ", error] }) }));
    }
    if (index === null) {
        return (_jsx(Box, { borderStyle: "single", borderColor: palette.borderIdle, paddingX: 1, width: width, children: _jsx(Text, { color: palette.textMuted, dimColor: true, children: "indexing files\u2026" }) }));
    }
    if (matches.length === 0) {
        return (_jsx(Box, { borderStyle: "single", borderColor: palette.borderIdle, paddingX: 1, width: width, children: _jsxs(Text, { color: palette.textMuted, dimColor: true, children: ["no matches for @", props.query] }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: palette.accent, paddingX: 1, width: width, children: [_jsxs(Box, { justifyContent: "space-between", children: [_jsxs(Text, { color: palette.accent, bold: true, children: ["@", props.query] }), _jsx(Text, { color: palette.textMuted, dimColor: true, children: "\u2191\u2193 \u00B7 tab/enter \u00B7 esc" })] }), matches.map((m, i) => (_jsxs(Box, { gap: 1, paddingLeft: 1, children: [_jsx(Text, { color: i === cursor ? palette.accent : palette.textMuted, children: i === cursor ? '>' : ' ' }), _jsx(Text, { color: i === cursor ? palette.textPrimary : palette.textMuted, bold: i === cursor, children: m.path })] }, m.path)))] }));
}
//# sourceMappingURL=AtFileComplete.js.map