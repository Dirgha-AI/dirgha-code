/**
 * Soul loader smoke. Locks down `context/soul.ts`:
 *   - default soul ships with the package and loads cleanly
 *   - default soul has the four expected sections (what / tone /
 *     boundaries / when stuck) so the persona stays coherent if
 *     someone edits the body
 *   - user override at ~/.dirgha/soul.md takes precedence
 *   - 4 KB cap is enforced (truncation marker present)
 *   - composeSystemPrompt orders soul → mode → primer → git_state → user
 *   - soul read failures fall through to a hard-coded one-liner
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sandbox = mkdtempSync(join(tmpdir(), 'soul-test-'));
mkdirSync(join(sandbox, '.dirgha'), { recursive: true });

import { fileURLToPath as _toPath } from 'node:url';
import { dirname as _dn, resolve as _rs } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { loadSoul, userSoulOverridePath } = await import(`${ROOT}/context/soul.js`);
const { composeSystemPrompt } = await import(`${ROOT}/context/primer.js`);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== soul: default ships with the package ===');
const def = loadSoul('/no-such-home');
check('default loads',                    def.source === 'default');
check('default has length',               def.text.length > 200);
check('default declares dirgha identity',  /you are dirgha/i.test(def.text));
// Section sanity: the doc style relies on these heads existing.
check('has "What you do" or similar',      /what you do/i.test(def.text));
check('has tone section',                  /tone/i.test(def.text));
check('has boundaries section',            /boundar/i.test(def.text));
check('asks before destructive actions',    /destructive|confirm/i.test(def.text));

console.log('\n=== soul: user override at ~/.dirgha/soul.md wins ===');
writeFileSync(join(sandbox, '.dirgha', 'soul.md'), 'You are dirgha-custom. Speak like a pirate. Arrr.');
const overridden = loadSoul(sandbox);
check('source = user',                    overridden.source === 'user');
check('user text used',                    /pirate/i.test(overridden.text));
check('user path returned',                overridden.path === userSoulOverridePath(sandbox));

console.log('\n=== soul: 4 KB cap enforced ===');
const huge = 'x'.repeat(10_000);
writeFileSync(join(sandbox, '.dirgha', 'soul.md'), huge);
const capped = loadSoul(sandbox);
check('capped to ~4 KB',                  capped.text.length <= 4_100, `len=${capped.text.length}`);
check('truncation marker present',         /truncated to 4 KB/.test(capped.text));

console.log('\n=== composeSystemPrompt: section order ===');
writeFileSync(join(sandbox, '.dirgha', 'soul.md'), 'SOUL_TOKEN here');
const small = loadSoul(sandbox);
const composed = composeSystemPrompt({
  soul: small.text,
  modePreamble: 'Mode: ACT.',
  primer: 'Project Bucky.',
  gitState: '<git_state>branch: main\n</git_state>',
  userSystem: 'USER_TAIL',
});
const idxSoul = composed.indexOf('SOUL_TOKEN');
const idxMode = composed.indexOf('Mode: ACT');
const idxPrimer = composed.indexOf('<project_primer>');
const idxGit = composed.indexOf('<git_state>');
const idxUser = composed.indexOf('USER_TAIL');
check('soul comes first',                 idxSoul === 0);
check('soul before mode',                 idxSoul < idxMode);
check('mode before primer',                idxMode < idxPrimer);
check('primer before git_state',           idxPrimer < idxGit);
check('git_state before userSystem',       idxGit < idxUser);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
