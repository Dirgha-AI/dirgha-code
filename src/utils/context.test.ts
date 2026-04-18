import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateContextSummary, detectProjectType } from './context.js';
import type { ProjectContext } from '../types.js';

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = mkdtempSync(join(tmpdir(), 'dirgha-ctx-'));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── generateContextSummary ─────────────────────────────────────────────────

describe('generateContextSummary', () => {
  const baseCtx: ProjectContext = {
    files: [],
    structure: { root: '/tmp/proj', directories: [], fileCount: 42, maxDepth: 3 },
    dependencies: { manager: 'pnpm', dependencies: { chalk: '^5' }, devDependencies: {}, totalCount: 1 },
    git: { branch: 'main', remote: 'https://github.com/x/y', lastCommit: 'abc fix bug', isClean: true },
    importantFiles: ['package.json', 'README.md'],
    ignoredPatterns: ['node_modules'],
  };

  it('includes file count', () => {
    const s = generateContextSummary(baseCtx);
    expect(s).toContain('42');
  });

  it('includes dependency count and manager', () => {
    const s = generateContextSummary(baseCtx);
    expect(s).toContain('1');
    expect(s).toContain('pnpm');
  });

  it('includes git branch', () => {
    const s = generateContextSummary(baseCtx);
    expect(s).toContain('main');
  });

  it('shows clean status', () => {
    const s = generateContextSummary(baseCtx);
    expect(s).toContain('clean');
  });

  it('shows dirty status when not clean', () => {
    const ctx = { ...baseCtx, git: { ...baseCtx.git!, isClean: false } };
    const s = generateContextSummary(ctx);
    expect(s).toContain('dirty');
  });

  it('skips git block when git is null', () => {
    const ctx = { ...baseCtx, git: null };
    const s = generateContextSummary(ctx);
    expect(s).not.toContain('branch=');
  });

  it('includes important files', () => {
    const s = generateContextSummary(baseCtx);
    expect(s).toContain('package.json');
  });

  it('skips dependency line when no deps', () => {
    const ctx = { ...baseCtx, dependencies: { ...baseCtx.dependencies, totalCount: 0 } };
    const s = generateContextSummary(ctx);
    expect(s).not.toContain('packages');
  });
});

// ── detectProjectType ──────────────────────────────────────────────────────

describe('detectProjectType', () => {
  it('detects node project from package.json', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{}');
    expect(detectProjectType()).toBe('node');
  });

  it('detects python project from requirements.txt', () => {
    writeFileSync(join(tmpDir, 'requirements.txt'), 'flask');
    expect(detectProjectType()).toBe('python');
  });

  it('detects python project from pyproject.toml', () => {
    writeFileSync(join(tmpDir, 'pyproject.toml'), '[tool.poetry]');
    expect(detectProjectType()).toBe('python');
  });

  it('detects rust project from Cargo.toml', () => {
    writeFileSync(join(tmpDir, 'Cargo.toml'), '[package]');
    expect(detectProjectType()).toBe('rust');
  });

  it('detects go project from go.mod', () => {
    writeFileSync(join(tmpDir, 'go.mod'), 'module example.com/m');
    expect(detectProjectType()).toBe('go');
  });

  it('returns generic for unknown project', () => {
    expect(detectProjectType()).toBe('generic');
  });
});
