import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

const CLI = process.env.CLI_BIN || './dist/cli/main.js';

describe('startup benchmark', () => {
  // Thresholds are generous to tolerate CI runner load (cold caches, noisy
  // neighbours, slow filesystem). These are performance benchmarks, not
  // correctness assertions — a flaky failure must never block a release.
  it('--version responds within 8s', () => {
    const start = performance.now();
    const out = execSync(`node ${CLI} --version`, { encoding: 'utf8', timeout: 12_000 });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(8000);
    expect(out.length).toBeGreaterThan(0);
  });

  it('--help responds within 8s', () => {
    const start = performance.now();
    const out = execSync(`node ${CLI} --help`, { encoding: 'utf8', timeout: 12_000 });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(8000);
    expect(out).toContain('Usage');
  });

  it('doctor runs under 15s', { timeout: 20_000 }, () => {
    const start = performance.now();
    const out = execSync(`node ${CLI} doctor --json`, { encoding: 'utf8', timeout: 20_000 });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(15000);
    expect(out).toContain('"status"');
  });
});
