import { describe, it, expect } from 'vitest';

describe('TUI smoke test', () => {
  it('ink module loads without crash', async () => {
    const mod = await import('../tui/ink/index.js');
    expect(mod).toBeDefined();
    expect(typeof mod.runInkTUI).toBe('function');
    expect(typeof mod.App).toBe('function');
  });

  it('safeWrite is installed and catches EPIPE', async () => {
    const mod = await import('../tui/ink/index.js');
    expect(mod).toBeDefined();
    // After module load, process.stdout.write is wrapped with safeWrite
    const fnStr = process.stdout.write.toString();
    expect(fnStr).toContain('EPIPE');
    expect(fnStr).toContain('EIO');
  });
});
