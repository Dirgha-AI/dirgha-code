import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isProjectInitialized,
  readProjectConfig,
  writeProjectConfig,
  createDefaultConfig,
} from './config.js';

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = mkdtempSync(join(tmpdir(), 'dirgha-cfg-'));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('isProjectInitialized', () => {
  it('returns false when no config exists', () => {
    expect(isProjectInitialized()).toBe(false);
  });

  it('returns true after config is written', () => {
    const cfg = createDefaultConfig();
    writeProjectConfig(cfg);
    expect(isProjectInitialized()).toBe(true);
  });
});

describe('readProjectConfig', () => {
  it('returns null when no config exists', () => {
    expect(readProjectConfig()).toBeNull();
  });

  it('returns parsed config after write', () => {
    const cfg = createDefaultConfig();
    writeProjectConfig(cfg);
    const read = readProjectConfig();
    expect(read).not.toBeNull();
    expect(read?.version).toBe('1.0.0');
    expect(read?.project.name).toBe(basename(tmpDir));
  });
});

describe('writeProjectConfig', () => {
  it('creates .dirgha directory if missing', () => {
    const cfg = createDefaultConfig();
    writeProjectConfig(cfg);
    expect(existsSync(join(tmpDir, '.dirgha', 'config.json'))).toBe(true);
  });

  it('round-trips preferences', () => {
    const cfg = createDefaultConfig();
    cfg.preferences.autoApply = true;
    cfg.preferences.verbose = true;
    writeProjectConfig(cfg);
    const read = readProjectConfig();
    expect(read?.preferences.autoApply).toBe(true);
    expect(read?.preferences.verbose).toBe(true);
  });
});

describe('createDefaultConfig', () => {
  it('uses the current directory basename as project name', () => {
    const cfg = createDefaultConfig();
    expect(cfg.project.name).toBe(basename(tmpDir));
  });

  it('sets default provider to litellm', () => {
    const cfg = createDefaultConfig();
    expect(cfg.preferences.defaultProvider).toBe('litellm');
  });

  it('includes node_modules in ignored patterns', () => {
    const cfg = createDefaultConfig();
    expect(cfg.context.ignoredPatterns).toContain('node_modules');
  });
});
