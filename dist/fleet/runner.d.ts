/**
 * fleet/runner.ts — Spawn and orchestrate N subagents in parallel worktrees.
 *
 * Each agent runs v2's agent-loop directly, NOT as a subprocess. cwd is
 * swapped per-agent via the ToolExecutor's `cwd`, so file operations are
 * isolated to the worktree without process isolation overhead.
 *
 * Flow:
 *   1. Resolve subtasks (decompose goal if not supplied).
 *   2. Create one worktree per subtask.
 *   3. Spawn agents under a bounded-concurrency semaphore.
 *   4. Forward per-agent AgentEvents + FleetEvents onto the parent stream.
 *   5. Gather results, compute totals, return FleetResult.
 *   6. Optional cleanup of worktrees.
 */
import { ProviderRegistry } from "../providers/index.js";
import { type FleetConfig, type FleetResult, type FleetSubtask } from "./types.js";
/**
 * Run a fleet. Accepts either explicit `subtasks` or a bare `goal` that
 * will be decomposed via the planner model.
 */
export declare function runFleet(config: FleetConfig): Promise<FleetResult>;
/**
 * Decompose a goal into subtasks via an LLM call. Single-shot; falls back
 * to a 1-element list ({ id:slug(goal), task:goal, type:'code' }) on any
 * error or unparseable response.
 */
export declare function decomposeGoal(goal: string, model: string, providers: ProviderRegistry): Promise<FleetSubtask[]>;
