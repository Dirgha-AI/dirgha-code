/**
 * fleet/tripleshot.ts — Spawn 3 stylistic variants, ask a judge, pick
 * the winner.
 *
 * For high-stakes tasks: the same goal is sent to three agents with
 * different stylistic framings (conservative / balanced / bold), each
 * in its own worktree. A judge agent is then asked to read the diffs
 * and pick the best one. Optionally auto-applies the winner back.
 *
 * The judge prompt is intentionally small and produces strict JSON so
 * parsing is deterministic; we fall back to the first completed variant
 * when the judge misbehaves.
 */
import type { FleetConfig, TripleshotResult } from './types.js';
export interface TripleshotConfig extends Omit<FleetConfig, 'subtasks' | 'concurrency'> {
    /** Auto-apply the winner's diff to the parent tree via applyBack. */
    autoMerge?: boolean;
    /** Override the judge model; defaults to `plannerModel` or `model`. */
    judgeModel?: string;
}
export declare function runTripleshot(goal: string, config: TripleshotConfig): Promise<TripleshotResult>;
