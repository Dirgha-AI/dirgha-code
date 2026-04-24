/**
 * Internal regression suite runner. Each task runs the full agent loop
 * in a temp working directory; success criteria come from
 * EvalTask.expectedArtifact. Suites ship as JSON under datasets/.
 */
import { ProviderRegistry } from '../providers/index.js';
import type { EvalReport, EvalTask } from './types.js';
export interface RegressionOptions {
    model: string;
    suiteName?: string;
    providers?: ProviderRegistry;
}
export declare function runRegressionSuite(tasks: EvalTask[], opts: RegressionOptions): Promise<EvalReport>;
export declare function loadTasksFromJson(path: string): EvalTask[];
