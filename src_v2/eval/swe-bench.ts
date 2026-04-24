/**
 * SWE-Bench Lite runner stub.
 *
 * The full harness requires a dataset loader that clones each
 * benchmark repository at the target commit, applies a base patch,
 * runs the provided tests, and compares to the expected patch. That
 * code ships in a follow-up sprint alongside the dataset manifest. The
 * shape here declares the public surface so eval callers can wire it
 * up without changing their own code later.
 */

import type { EvalReport, EvalResult } from './types.js';

export interface SweBenchConfig {
  datasetPath: string;
  model: string;
  suite: 'lite' | 'full';
  taskFilter?: (taskId: string) => boolean;
}

export async function runSweBench(config: SweBenchConfig): Promise<EvalReport> {
  return {
    suite: `swe-bench-${config.suite}`,
    model: config.model,
    runAt: new Date().toISOString(),
    total: 0,
    passed: 0,
    failed: 0,
    durationMs: 0,
    results: [] as EvalResult[],
  };
}
