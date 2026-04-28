/**
 * Theme loader: baked-in themes + user-defined themes from
 * `~/.dirgha/themes/<name>.json`. Partial themes fall back to `darkTheme`
 * for missing keys; a missing theme file falls back to `darkTheme`
 * with a stderr warning.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { resolveThemeByName, listAvailableThemes } = await import(_toUrl(_join(ROOT, 'tui/theme-loader.js')).href);
const { darkTheme, lightTheme } = await import(_toUrl(_join(ROOT, 'tui/theme.js')).href);

const home = mkdtempSync(join(tmpdir(), 'theme-home-'));
mkdirSync(join(home, '.dirgha', 'themes'), { recursive: true });

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== baked-in themes ===');
check('dark theme returns darkTheme',     resolveThemeByName('dark', home) === darkTheme);
check('light theme returns lightTheme',   resolveThemeByName('light', home) === lightTheme);
check('undefined → dark',                 resolveThemeByName(undefined, home) === darkTheme);

console.log('\n=== user-defined theme ===');
const sunrise = { userPrompt: '\x1b[33m', accent: '\x1b[35m' };
writeFileSync(join(home, '.dirgha', 'themes', 'sunrise.json'), JSON.stringify(sunrise));
const r = resolveThemeByName('sunrise', home);
check('userPrompt overridden',            r.userPrompt === '\x1b[33m');
check('accent overridden',                r.accent === '\x1b[35m');
check('non-overridden key falls back',    r.danger === darkTheme.danger);

console.log('\n=== missing theme falls back ===');
// stderr warning is expected; suppress it for the test by capturing.
const origStderr = process.stderr.write.bind(process.stderr);
let warned = '';
process.stderr.write = (chunk) => { warned += String(chunk); return true; };
const fallback = resolveThemeByName('does-not-exist', home);
process.stderr.write = origStderr;
check('missing theme returns darkTheme',  fallback === darkTheme);
check('missing theme prints a warning',   /warning:/.test(warned));

console.log('\n=== listAvailableThemes ===');
const avail = listAvailableThemes(home);
check('list contains baked-ins',          avail.includes('dark') && avail.includes('light') && avail.includes('none'));
check('list contains user-defined',       avail.includes('sunrise'));

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
