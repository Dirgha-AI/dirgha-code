import { describe, it, expect } from 'vitest';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

describe('Path Utilities', () => {
  it('resolves relative paths correctly', () => {
    const base = '/home/user/project';
    const relative = './src/index.ts';
    const result = resolve(base, relative);
    expect(result).toBe('/home/user/project/src/index.ts');
  });

  it('joins path segments', () => {
    const result = join('src', 'commands', 'mesh.ts');
    expect(result).toContain('src');
    expect(result).toContain('commands');
    expect(result).toContain('mesh.ts');
  });

  it('gets directory name', () => {
    const path = '/home/user/project/src/index.ts';
    const dir = dirname(path);
    expect(dir).toBe('/home/user/project/src');
  });
});

describe('Configuration Paths', () => {
  it('has consistent config directory', () => {
    const homeDir = process.env.HOME || '/tmp';
    const configDir = join(homeDir, '.dirgha');
    expect(configDir).toContain('.dirgha');
  });

  it('has correct key file path', () => {
    const homeDir = process.env.HOME || '/tmp';
    const keyPath = join(homeDir, '.dirgha', 'keys.json');
    expect(keyPath).toContain('keys.json');
  });
});
