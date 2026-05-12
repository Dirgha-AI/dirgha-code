import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

const CLI = process.env.CLI_BIN || './dist/cli/main.js';

describe('startup benchmark', () => {
  it('--version responds within 2s', () => {
    const start = performance.now();
    const out = execSync(`node ${CLI} --version`, { encoding: 'utf8', timeout: 5000 });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    expect(out.length).toBeGreaterThan(0);
  });

  it('--help responds within 3s', () => {
    const start = performance.now();
    const out = execSync(`node ${CLI} --help`, { encoding: 'utf8', timeout: 8000 });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(3000);
    expect(out).toContain('Usage');
  });

  it('doctor runs under 10s', () => {
    const start = performance.now();
    const out = execSync(`node ${CLI} doctor --json`, { encoding: 'utf8', timeout: 15000 });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10000);
    expect(out).toContain('"status"');
  });
});
