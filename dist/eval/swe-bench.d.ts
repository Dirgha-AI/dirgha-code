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
import type { EvalReport } from './types.js';
export interface SweBenchConfig {
    datasetPath: string;
    model: string;
    suite: 'lite' | 'full';
    taskFilter?: (taskId: string) => boolean;
}
export declare function runSweBench(config: SweBenchConfig): Promise<EvalReport>;
