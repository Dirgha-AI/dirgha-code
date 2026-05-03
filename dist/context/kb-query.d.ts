/**
 * KB auto-injection helper.
 *
 * Queries the local knowledge store (~/.dirgha/knowledge/) for articles
 * relevant to the current user turn and returns a formatted string
 * suitable for injection into the system prompt via composeSystemPrompt.
 *
 * Design constraints:
 *  - Never throws — KB unavailability must not crash the main loop.
 *  - Bounded to 500 ms via Promise.race timeout.
 *  - Returns undefined when no relevant results exist (so the caller
 *    can skip the section cleanly).
 */
/**
 * Return up to `topK` KB article snippets relevant to `userTurn`,
 * formatted as a `<kb_context>` block. Returns `undefined` when the
 * KB is empty, unavailable, or no results score above zero.
 */
export declare function queryKb(userTurn: string, topK?: number): Promise<string | undefined>;
