/**
 * String-replace edit with exact and fuzzy matching.
 *
 * Exact match is the fast path. When the exact string is missing, the
 * tool falls back to whitespace-normalised matching and, if still
 * ambiguous, returns an error with the candidate contexts so the agent
 * can retry with more specific anchors. This is deterministic and
 * auditable — no "nearest fuzzy match" guessing.
 */
import type { Tool } from "./registry.js";
export declare const fsEditTool: Tool;
