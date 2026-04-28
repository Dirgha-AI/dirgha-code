import { describe, expect, it } from 'vitest';
import { runParity } from '../runner.js';
import { DEFAULT_SCENARIOS } from '../scenarios.js';

describe('parity harness', () => {
  it('runs all default scenarios successfully', async () => {
    const report = await runParity(DEFAULT_SCENARIOS);
    const failures = report.scenarios.filter(s => !s.ok);
    if (failures.length > 0) {
      for (const f of failures) {
        console.error(`FAIL ${f.name}:\n${f.diff}`);
      }
    }
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(report.total);
  });
});
