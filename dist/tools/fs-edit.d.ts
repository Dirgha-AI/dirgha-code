/**
 * String-replace edit with exact matching.
 *
 * When the exact string is missing, returns an error so the agent can
 * retry with more specific anchors. This is deterministic and
 * auditable — no "nearest fuzzy match" guessing.
 */
import type { Tool } from "./registry.js";
export declare const fsEditTool: Tool;
