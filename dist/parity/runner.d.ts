/**
 * Parity runner. For each scenario, spins up a mock server, points the
 * provider adapter at it, collects events, and diffs against the
 * scenario's expected type sequence. Reports success/failure with a
 * per-scenario diff.
 */
import type { ParityScenario } from './scenarios.js';
export interface ParityReport {
    total: number;
    passed: number;
    failed: number;
    scenarios: ParityScenarioReport[];
}
export interface ParityScenarioReport {
    name: string;
    ok: boolean;
    expected: string[];
    actual: string[];
    diff?: string;
}
export declare function runParity(scenarios: ParityScenario[]): Promise<ParityReport>;
