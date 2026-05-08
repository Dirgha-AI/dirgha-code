/**
 * transactional_write tool — atomic multi-model write across all four
 * data shapes (relational + FTS + vector + graph).
 *
 * Accepts an optional message, embedding, graph nodes, and graph edges
 * in a single tool call. Everything commits or nothing does — the agent
 * gets a true per-session ACID guarantee.
 */
import type { Tool } from "./registry.js";
export declare const transactionalWriteTool: Tool;
