/**
 * `dirgha update` core. Drives `cli/subcommands/update.ts` API surface
 * directly (compareSemver / checkLatestVersion / listInstalledPacks)
 * with an injected fetch so the test never hits the network and runs
 * in milliseconds.
 *
 * Coverage:
 *   - compareSemver ordering + numeric segments (1.10 > 1.9)
 *   - compareSemver pre-release: 1.0.0-rc.1 < 1.0.0
 *   - compareSemver equal returns 0
 *   - checkLatestVersion outdated=true when latest > current
 *   - checkLatestVersion outdated=false on equal version
 *   - checkLatestVersion network failure: latest=null + error set
 *   - listInstalledPacks: scans baseDir/skills/<name>/SKILL.md, reads
 *     `version:` from frontmatter, returns undefined when absent
 *   - listInstalledPacks: tolerates missing skills/ directory cleanly
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist');
const upd = await import(_toUrl(_join(ROOT, 'cli/subcommands/update.js')).href);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== compareSemver: numeric ordering ===');
check('1.0.0 < 1.0.1',                upd.compareSemver('1.0.0',  '1.0.1')  === -1);
check('1.0.1 < 1.10.0',                upd.compareSemver('1.0.1',  '1.10.0') === -1);
check('1.10.0 < 2.0.0',                upd.compareSemver('1.10.0', '2.0.0')  === -1);
check('2.0.0 > 1.10.0',                upd.compareSemver('2.0.0',  '1.10.0') === 1);
check('equal returns 0',               upd.compareSemver('1.2.3',  '1.2.3')  === 0);
check('zero-padded equal',              upd.compareSemver('1.2',    '1.2.0')  === 0);

console.log('\n=== compareSemver: pre-release ranking ===');
check('1.0.0-rc.1 < 1.0.0',           upd.compareSemver('1.0.0-rc.1', '1.0.0') === -1);
check('1.0.0 > 1.0.0-rc.1',           upd.compareSemver('1.0.0', '1.0.0-rc.1') === 1);
check('rc.1 < rc.2',                   upd.compareSemver('1.0.0-rc.1', '1.0.0-rc.2') === -1);

console.log('\n=== checkLatestVersion: outdated detection ===');
const okFetch = (latest) => async () => ({ ok: true, status: 200, json: async () => ({ version: latest }) });
const out1 = await upd.checkLatestVersion({ currentVersion: '1.2.0', fetchImpl: okFetch('1.3.0') });
check('outdated=true for newer latest',  out1.outdated === true);
check('current preserved',                out1.current === '1.2.0');
check('latest reported',                  out1.latest === '1.3.0');

const out2 = await upd.checkLatestVersion({ currentVersion: '1.3.0', fetchImpl: okFetch('1.3.0') });
check('outdated=false on equal version',  out2.outdated === false);

console.log('\n=== checkLatestVersion: network failure ===');
const badFetch = async () => { throw new Error('ENOTFOUND registry.npmjs.org'); };
const out3 = await upd.checkLatestVersion({ currentVersion: '1.2.0', fetchImpl: badFetch });
check('latest=null on fetch throw',       out3.latest === null);
check('error string surfaced',            typeof out3.error === 'string' && /ENOTFOUND/.test(out3.error));
check('outdated=false on error',          out3.outdated === false);

const non200Fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const out4 = await upd.checkLatestVersion({ currentVersion: '1.2.0', fetchImpl: non200Fetch });
check('latest=null on non-200',           out4.latest === null);
check('HTTP error surfaced',              /404/.test(out4.error ?? ''));

console.log('\n=== listInstalledPacks: scans skills dir ===');
const sandbox = mkdtempSync(join(tmpdir(), 'update-test-'));
const skillsDir = join(sandbox, 'skills');
mkdirSync(skillsDir, { recursive: true });
mkdirSync(join(skillsDir, 'lint-helper'), { recursive: true });
mkdirSync(join(skillsDir, 'doc-writer'),  { recursive: true });
writeFileSync(join(skillsDir, 'lint-helper', 'SKILL.md'),
  '---\nname: lint-helper\ndescription: lint code\nversion: 0.4.2\n---\n\n# Lint helper\n');
writeFileSync(join(skillsDir, 'doc-writer', 'SKILL.md'),
  '---\nname: doc-writer\ndescription: writes docs\n---\n\n# Doc writer\n');

const packs = upd.listInstalledPacks({ baseDir: sandbox });
check('two packs found',                  packs.length === 2);
const lint = packs.find(p => p.name === 'lint-helper');
const doc  = packs.find(p => p.name === 'doc-writer');
check('lint-helper version=0.4.2',         lint?.version === '0.4.2');
check('doc-writer version undefined',      doc?.version === undefined);
check('lint-helper path is correct',       lint?.path === join(skillsDir, 'lint-helper'));

console.log('\n=== listInstalledPacks: missing skills dir is fine ===');
const empty = mkdtempSync(join(tmpdir(), 'update-empty-'));
const packsEmpty = upd.listInstalledPacks({ baseDir: empty });
check('empty array on missing dir',        Array.isArray(packsEmpty) && packsEmpty.length === 0);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
