/**
 * graph_neighbors tool — one-hop graph neighbour lookup.
 *
 * Returns immediate neighbours of a graph node via directed edges.
 * Filterable by relation label and direction (out/in/both).
 * Uses the same SQLite DB as the relational + FTS stores.
 */
import type { Tool } from "./registry.js";
export declare const graphNeighborsTool: Tool;
