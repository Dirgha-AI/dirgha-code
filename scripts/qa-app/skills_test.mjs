/**
 * Skills loader/matcher/runtime end-to-end.
 *
 * Drops a SKILL.md fixture into a scratch HOME, calls loadSkills,
 * verifies it appears in the discovery list, runs matchSkills with
 * matching keywords, asserts it gets selected, then injects via
 * runtime and asserts the output contains the skill body.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'skills-home-'));
process.env.HOME = home;
const skillDir = join(home, '.dirgha', 'skills', 'lint-helper');
mkdirSync(skillDir, { recursive: true });
writeFileSync(join(skillDir, 'SKILL.md'), `---
name: lint-helper
description: Procedural guidance for fixing eslint errors
version: 1.0.0
triggers:
  keywords: [eslint, lint, formatting]
---

When the user asks about lint errors, suggest running \`npm run lint\` first
and then fixing each error manually.
`);

const projDir = mkdtempSync(join(tmpdir(), 'skills-proj-'));

import { fileURLToPath as _toPath } from 'node:url';
import { dirname as _dn, resolve as _rs } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { loadSkills } = await import(`${ROOT}/skills/loader.js`);
const { matchSkills } = await import(`${ROOT}/skills/matcher.js`);
const { injectSkills } = await import(`${ROOT}/skills/runtime.js`);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== skills loader ===');

const all = await loadSkills({ cwd: projDir, userHome: home });
check('discovers user-global skill',     all.some(s => s.meta.name === 'lint-helper'));
const lint = all.find(s => s.meta.name === 'lint-helper');
check('parses frontmatter (description)', lint?.meta.description.includes('eslint') === true);
check('parses frontmatter (version)',    lint?.meta.version === '1.0.0');
check('parses triggers.keywords',        Array.isArray(lint?.meta.triggers?.keywords));
check('body captured below ---',         lint?.body.includes('npm run lint') === true);

console.log('\n=== skills matcher ===');

const matchYes = matchSkills(all, { platform: 'cli', userMessage: 'How do I fix eslint errors?' });
check('matches on keyword "eslint"',     matchYes.some(s => s.meta.name === 'lint-helper'));

const matchNo = matchSkills(all, { platform: 'cli', userMessage: 'How do I write a haiku?' });
check('does NOT match unrelated prompt', !matchNo.some(s => s.meta.name === 'lint-helper'));

const matchExplicit = matchSkills(all, { platform: 'cli', userMessage: 'unrelated', explicit: ['lint-helper'] });
check('explicit selection bypasses triggers', matchExplicit.some(s => s.meta.name === 'lint-helper'));

console.log('\n=== skills runtime (injection) ===');

const baseMessages = [{ role: 'user', content: 'How do I fix eslint errors?' }];
const injected = injectSkills(baseMessages, matchYes);
check('injection adds a message',        injected.length > baseMessages.length);
// Read the actual rendered text instead of JSON-stringifying — the
// stringified form escapes double-quotes which would hide real bugs
// (or surface fake ones, as it did pre-fix).
const injectionText = injected
  .map(m => typeof m.content === 'string' ? m.content : m.content.map(p => p.text ?? '').join('\n'))
  .join('\n');
check('injection contains skill body',   injectionText.includes('npm run lint'));
check('injection has <skill> tag',       injectionText.includes('<skill name="lint-helper"'));

// 4. Project-local override of user-global.
const projSkillDir = join(projDir, '.dirgha', 'skills', 'lint-helper');
mkdirSync(projSkillDir, { recursive: true });
writeFileSync(join(projSkillDir, 'SKILL.md'), `---
name: lint-helper
description: Project-specific lint guidance overrides user-global
triggers:
  keywords: [eslint, lint]
---

This is the project version.
`);
const all2 = await loadSkills({ cwd: projDir, userHome: home });
const projHit = all2.find(s => s.meta.name === 'lint-helper');
check('project-local override wins',     projHit?.source === 'project');
check('project body replaces user body', projHit?.body.includes('project version') === true);

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
