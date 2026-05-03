import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Logo: single-item banner shown once at startup.
 *
 * Width-adaptive: wide ASCII block on terminals >= 60 cols, compact
 * one-liner otherwise. Default colour scheme is the violet-storm
 * gradient from the v2 origin commit (28f2bc3) — kept fixed across
 * themes because the brand wordmark should read the same regardless
 * of which palette the user prefers for chrome. Themes that ship
 * their own logo gradient (cosmic, ember, sakura, …) override below.
 */
import * as React from 'react';
import { Box, Text, useStdout } from 'ink';
import { useTheme } from '../theme-context.js';
const WIDE_ROWS = [
    '  ██████╗ ██╗██████╗  ██████╗ ██╗  ██╗ █████╗ ',
    '  ██╔══██╗██║██╔══██╗██╔════╝ ██║  ██║██╔══██╗',
    '  ██║  ██║██║██████╔╝██║  ███╗███████║███████║',
    '  ██║  ██║██║██╔══██╗██║   ██║██╔══██║██╔══██║',
    '  ██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║',
    '  ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝',
];
// Violet-storm: the original v2 logo. Default for every theme that
// doesn't define its own skin.
const VIOLET_STORM = {
    rows: ['#C4B5FD', '#A78BFA', '#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6'],
    border: '#5B21B6',
    tag: '#A78BFA',
};
// A handful of themes ship their own gradient — these are the
// "batch" designs from scripts/preview-logos.mjs ported in. Keys are
// theme names; everything else falls back to violet-storm above.
const SKINS = {
    'violet-storm': VIOLET_STORM,
    cosmic: { rows: ['#FB5607', '#FFBE0B', '#8338EC', '#3A86FF', '#06FFA5', '#FF006E'], border: '#FF006E', tag: '#FFBE0B' },
    ember: { rows: ['#F9D423', '#F9D423', '#FF6B35', '#FF6B35', '#FF4E50', '#FF4E50'], border: '#FF4E50', tag: '#F9D423' },
    ocean: { rows: ['#00C9FF', '#00C9FF', '#92FE9D', '#92FE9D', '#00D2FF', '#3A7BD5'], border: '#0061FF', tag: '#00C9FF' },
    sakura: { rows: ['#FF69B4', '#FF69B4', '#FF1493', '#FF1493', '#FFB7C5', '#C71585'], border: '#FFB7C5', tag: '#FF69B4' },
    'obsidian-gold': { rows: ['#FFA500', '#FFA500', '#FF8C00', '#FF8C00', '#FFD700', '#B8860B'], border: '#FFD700', tag: '#FFA500' },
    nord: { rows: ['#E0FFFF', '#E0FFFF', '#00BFFF', '#00BFFF', '#00FFFF', '#1E90FF'], border: '#00FFFF', tag: '#E0FFFF' },
    crimson: { rows: ['#00FF99', '#00FF99', '#00CCFF', '#00CCFF', '#FF0055', '#FF0055'], border: '#FF0055', tag: '#00FF99' },
};
function skinFor(themeName) {
    if (themeName && SKINS[themeName])
        return SKINS[themeName];
    return VIOLET_STORM;
}
export function Logo({ version }) {
    const { stdout } = useStdout();
    const palette = useTheme();
    // Snapshot terminal width at mount — Logo lives inside Ink's <Static> and
    // must not re-render. A ref avoids creating a reactive resize subscription.
    const colsRef = React.useRef(stdout?.columns ?? 80);
    const cols = colsRef.current;
    // The palette doesn't carry its own name, so we infer the skin from
    // a stable fingerprint: themes with a unique brand colour map to
    // their named skin. Anything we don't recognise gets violet-storm.
    const themeKey = Object.keys(SKINS).find(k => {
        const skin = SKINS[k];
        return skin && skin.border.toLowerCase() === palette.borderActive.toLowerCase();
    });
    const skin = skinFor(themeKey);
    if (cols < 60) {
        return (_jsx(Box, { flexDirection: "column", paddingLeft: 2, marginBottom: 1, children: _jsxs(Text, { children: [_jsx(Text, { color: skin.rows[2] ?? skin.tag, bold: true, children: "\u25C6 DIRGHA CODE" }), _jsx(Text, { color: palette.textMuted, children: `  v${version}` })] }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", paddingLeft: 2, marginBottom: 1, children: [_jsx(Text, { color: skin.border, children: '    ╭──────────────────────────────────────────────────────────╮' }), WIDE_ROWS.map((row, i) => {
                const colour = skin.rows[i] ?? skin.rows[0] ?? skin.tag;
                return (_jsxs(Text, { color: skin.border, children: ['    │', _jsx(Text, { color: colour, children: row }), '│'] }, i));
            }), _jsx(Text, { color: skin.border, children: '    ╰──────────────────────────────────────────────────────────╯' }), _jsxs(Text, { children: ['    ', _jsx(Text, { color: skin.tag, bold: true, children: "Dirgha Code" }), _jsx(Text, { color: palette.textMuted, children: `  v${version}` })] })] }));
}
//# sourceMappingURL=Logo.js.map