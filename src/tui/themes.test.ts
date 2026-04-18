/**
 * tui/themes.test.ts — Theme switching and keybinding tests (C5.4, C5.5)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

// ── Theme tests ───────────────────────────────────────────────────────────────

describe('Theme: setTheme / getActiveThemeName', () => {
  const cfgDir  = path.join(os.tmpdir(), `.dirgha-test-${process.pid}`);
  const cfgFile = path.join(cfgDir, 'config.json');

  beforeEach(() => {
    fs.mkdirSync(cfgDir, { recursive: true });
    // Point module to temp dir by overriding HOME
    vi.stubEnv('HOME', cfgDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(cfgDir, { recursive: true, force: true });
  });

  it('setTheme returns true for valid theme', async () => {
    const { setTheme } = await import('./colors.js');
    expect(setTheme('midnight')).toBe(true);
  });

  it('setTheme returns false for unknown theme', async () => {
    const { setTheme } = await import('./colors.js');
    expect(setTheme('neon' as any)).toBe(false);
  });

  it('getActiveThemeName returns updated theme after setTheme', async () => {
    const { setTheme, getActiveThemeName } = await import('./colors.js');
    setTheme('ocean');
    expect(getActiveThemeName()).toBe('ocean');
    // Reset
    setTheme('default');
    expect(getActiveThemeName()).toBe('default');
  });

  it('C proxy reads live color after theme switch', async () => {
    const { setTheme, C, THEMES } = await import('./colors.js');
    setTheme('midnight');
    expect(C.brand).toBe(THEMES.midnight.brand);
    setTheme('default');
    expect(C.brand).toBe(THEMES.default.brand);
  });
});

// ── Keybinding tests ──────────────────────────────────────────────────────────

describe('Keybindings: kb / setKeybinding', () => {
  const kbDir  = path.join(os.tmpdir(), `.dirgha-kb-${process.pid}`);
  const kbFile = path.join(kbDir, 'keybindings.json');

  beforeEach(() => {
    fs.mkdirSync(kbDir, { recursive: true });
    vi.stubEnv('HOME', kbDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(kbDir, { recursive: true, force: true });
  });

  it('default scrollUp matches ctrl+u', async () => {
    const { kb } = await import('./keybindings.js');
    expect(kb('scrollUp', 'u', { ctrl: true })).toBe(true);
  });

  it('default scrollUp does NOT match plain u', async () => {
    const { kb } = await import('./keybindings.js');
    expect(kb('scrollUp', 'u', {})).toBe(false);
  });

  it('setKeybinding rebinds scrollUp to ctrl+k', async () => {
    const { setKeybinding, kb } = await import('./keybindings.js');
    setKeybinding('scrollUp', 'ctrl+k');
    expect(kb('scrollUp', 'k', { ctrl: true })).toBe(true);
    expect(kb('scrollUp', 'u', { ctrl: true })).toBe(false);
    // Restore
    setKeybinding('scrollUp', 'ctrl+u');
  });

  it('kbLabel returns human-readable string', async () => {
    const { kbLabel, setKeybinding } = await import('./keybindings.js');
    setKeybinding('scrollUp', 'ctrl+u');
    const label = kbLabel('scrollUp');
    expect(label).toMatch(/ctrl/i);
    expect(label).toMatch(/u/i);
  });
});
