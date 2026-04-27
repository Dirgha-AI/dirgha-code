import { describe, it, expect } from 'vitest';
import { installNpmSkill } from '../install-npm.js';

// Validation tests — all of these should reject before reaching npm pack.
// Real install paths are exercised in the smoke-matrix; this stays offline.
describe('installNpmSkill — spec validation', () => {
  it.each<[string, RegExp]>([
    ['', /Must start with "npm:"/],
    ['git+https://github.com/foo/bar', /Must start with "npm:"/],
    ['npm:', /Invalid npm package spec/],
    ['npm:--evil',                /Invalid npm package spec/],
    ['npm:-rf',                   /Invalid npm package spec/],
    ['npm:.weird',                /Invalid npm package spec/],
    ['npm:@scope/-evil',          /Invalid npm package spec/],
    ['npm:has spaces',            /Invalid npm package spec/],
    ['npm:UPPER',                 /Invalid npm package spec/],
    ['npm:foo;rm -rf',            /Invalid npm package spec/],
    ['npm:$(rm)',                 /Invalid npm package spec/],
  ])('rejects %s', async (spec, pattern) => {
    await expect(installNpmSkill(spec)).rejects.toThrow(pattern);
  });

  // These pass validation — they would call `npm pack` next, which we
  // don't network-test here.  The "Command failed: npm pack ..." in the
  // rejection message confirms validation passed.
  it.each([
    'npm:legitpkg',
    'npm:legit-pkg',
    'npm:legit-pkg@1.0.0',
    'npm:@scope/pkg',
    'npm:@scope/pkg@1.2.3',
    'npm:@scope/pkg@beta',
  ])('accepts %s and proceeds to npm pack', async (spec) => {
    await expect(installNpmSkill(spec)).rejects.toThrow(/npm pack|Unexpected npm pack output|404|HTTP/);
  });
});
