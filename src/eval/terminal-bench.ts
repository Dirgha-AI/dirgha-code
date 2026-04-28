/**
 * Terminal-Bench runner stub. Benchmarks agent terminal interactions
 * against scripted scenarios (shell recipes, navigational tasks). The
 * real runner requires a container harness to isolate state; that
 * integration ships separately.
 */

import type { EvalReport, EvalResult } from './types.js';

export interface TerminalBenchConfig {
  datasetPath: string;
  model: string;
  taskFilter?: (taskId: string) => boolean;
}

export async function runTerminalBench(config: TerminalBenchConfig): Promise<EvalReport> {
  return {
    suite: 'terminal-bench',
    model: config.model,
    runAt: new Date().toISOString(),
    total: 0,
    passed: 0,
    failed: 0,
    durationMs: 0,
    results: [] as EvalResult[],
  };
}
