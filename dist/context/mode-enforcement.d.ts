/**
 * Mode-based tool gating.
 *
 * The mode preamble in the system prompt tells the model "don't write
 * in plan mode" — but a model that ignores instructions can still fire
 * a destructive tool. Real enforcement happens at the kernel hook
 * layer: `enforceMode(mode)` returns an AgentHooks fragment whose
 * `beforeToolCall` blocks every write when the mode is plan or verify.
 *
 * Compose with user-defined hooks via `composeHooks(...)`. This module
 * also exports the canonical write-tool set so downstream consumers
 * (e.g. the agent itself, audit displays) can reason about it.
 */
import type { AgentHooks } from '../kernel/types.js';
import type { Mode } from './mode.js';
/**
 * Tools that mutate the filesystem, run shells, or otherwise produce
 * side effects beyond reading. Names match `tools/index.ts` exactly.
 *
 * `checkpoint` is mutating (save / restore / delete) but harmless to
 * the project tree (only writes inside ~/.dirgha) — we still block it
 * in plan/verify so the user gets a clean read-only run.
 */
export declare const WRITE_TOOLS: Set<string>;
export declare function enforceMode(mode: Mode): AgentHooks | undefined;
/**
 * Sequence-compose two AgentHooks objects. Each lifecycle event runs
 * `a` first, then `b`. If `a.beforeTurn` returns 'abort' or
 * `a.beforeToolCall` blocks, `b` is skipped for that event. After-
 * hooks always run both. Either side may be undefined.
 */
export declare function composeHooks(a: AgentHooks | undefined, b: AgentHooks | undefined): AgentHooks | undefined;
