/**
 * graph_traverse tool — recursive forward traversal from a starting node.
 *
 * Uses a SQLite recursive CTE to walk graph_edges. Returns each reachable
 * node with depth, the relation it was reached via, and the parent node.
 * Bounded by max_depth + max_results. Cycles are detected and skipped via
 * a path-tracking column.
 */
import type { Tool } from "./registry.js";
export declare const graphTraverseTool: Tool;
