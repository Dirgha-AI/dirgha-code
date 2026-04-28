/**
 * Terminal-Bench runner stub. Benchmarks agent terminal interactions
 * against scripted scenarios (shell recipes, navigational tasks). The
 * real runner requires a container harness to isolate state; that
 * integration ships separately.
 */
import type { EvalReport } from './types.js';
export interface TerminalBenchConfig {
    datasetPath: string;
    model: string;
    taskFilter?: (taskId: string) => boolean;
}
export declare function runTerminalBench(config: TerminalBenchConfig): Promise<EvalReport>;
