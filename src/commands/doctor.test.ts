/**
 * commands/doctor.test.ts — doctor command smoke tests (C5.7)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

describe('Doctor: disk write check', () => {
  const tmpDir = path.join(os.tmpdir(), `.dirgha-doctor-${process.pid}`);

  beforeEach(() => { fs.mkdirSync(tmpDir, { recursive: true }); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('can write and delete a test file', () => {
    const f = path.join(tmpDir, '.write-test');
    fs.writeFileSync(f, 'ok');
    expect(fs.existsSync(f)).toBe(true);
    fs.unlinkSync(f);
    expect(fs.existsSync(f)).toBe(false);
  });
});

describe('Doctor: node version check', () => {
  it('current Node.js meets minimum v18', () => {
    const major = parseInt(process.version.slice(1));
    expect(major).toBeGreaterThanOrEqual(18);
  });
});

describe('Doctor: update command version check', () => {
  it('CURRENT version string is semver-like', async () => {
    // We can't import the command directly (execSync side-effect), so check version format
    const pkg = JSON.parse(fs.readFileSync(
      path.join(process.cwd(), 'package.json'), 'utf8'
    ));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
