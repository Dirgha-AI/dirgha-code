/**
 * Project primer is loaded into the system prompt.
 * Walks up parent dirs for DIRGHA.md / CLAUDE.md, caps at 8 KB,
 * composes via `<project_primer>` block.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { loadProjectPrimer, composeSystemPrompt } = await import(_toUrl(_join(ROOT, 'context/primer.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== project primer ===');

// 1. No primer when no file present.
const empty = mkdtempSync(join(tmpdir(), 'primer-empty-'));
const r1 = loadProjectPrimer(empty);
check('no primer found in empty dir', r1.primer === '' && r1.source === null);

// 2. DIRGHA.md is loaded when present.
const root = mkdtempSync(join(tmpdir(), 'primer-root-'));
writeFileSync(join(root, 'DIRGHA.md'), '# Test\n\nMagic phrase: PRIMER_OK_777\n');
const r2 = loadProjectPrimer(root);
check('DIRGHA.md loaded', r2.primer.includes('PRIMER_OK_777'));
check('source path captured', r2.source?.endsWith('DIRGHA.md') === true);
check('not truncated for small file', r2.truncated === false);

// 3. Walks up parent directories.
const sub = join(root, 'sub', 'deeper');
mkdirSync(sub, { recursive: true });
const r3 = loadProjectPrimer(sub);
check('walks up to find DIRGHA.md', r3.primer.includes('PRIMER_OK_777'));

// 4. CLAUDE.md is a fallback when DIRGHA.md absent.
const claudeRoot = mkdtempSync(join(tmpdir(), 'primer-claude-'));
writeFileSync(join(claudeRoot, 'CLAUDE.md'), '# claude file\nAnother phrase: CLAUDE_FALLBACK_42\n');
const r4 = loadProjectPrimer(claudeRoot);
check('CLAUDE.md picked up as fallback', r4.primer.includes('CLAUDE_FALLBACK_42'));

// 5. Truncation kicks in over 8 KB.
const bigRoot = mkdtempSync(join(tmpdir(), 'primer-big-'));
writeFileSync(join(bigRoot, 'DIRGHA.md'), 'X'.repeat(20_000));
const r5 = loadProjectPrimer(bigRoot);
check('truncated over 8 KB', r5.truncated === true && r5.primer.length < 9_000);

// 6. composeSystemPrompt joins all three sections.
const composed = composeSystemPrompt({
  modePreamble: 'Mode: ACT.',
  primer: 'project context here',
  userSystem: 'extra system text',
});
check('composed prompt has mode preamble',  composed.startsWith('Mode: ACT.'));
check('composed prompt has primer block',   /<project_primer>[\s\S]*project context here[\s\S]*<\/project_primer>/.test(composed));
check('composed prompt has user system',    composed.includes('extra system text'));

// 7. Empty sections drop out.
const minimal = composeSystemPrompt({ modePreamble: 'Mode: ACT.' });
check('no primer block when primer empty',  !minimal.includes('<project_primer>'));
check('no trailing whitespace',             minimal.trim() === minimal);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
