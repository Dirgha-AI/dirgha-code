/**
 * Heuristic repair for partial or malformed JSON produced by streaming
 * model output. Invoked when a JSON.parse fails on a tool-call argument
 * blob or a chunked response. Best-effort — returns {} on total failure
 * so callers never throw from a cosmetically bad payload.
 */
export declare function repairJSON(raw: string): unknown;
