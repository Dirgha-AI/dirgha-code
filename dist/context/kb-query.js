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
import { createKnowledgeStore } from "./knowledge.js";
const KB_TOP_K = 5;
const KB_TIMEOUT_MS = 500;
/**
 * Return up to `topK` KB article snippets relevant to `userTurn`,
 * formatted as a `<kb_context>` block. Returns `undefined` when the
 * KB is empty, unavailable, or no results score above zero.
 */
export async function queryKb(userTurn, topK = KB_TOP_K) {
    if (!userTurn.trim())
        return undefined;
    const query = async () => {
        const store = createKnowledgeStore();
        const hits = await store.searchArticles(userTurn, topK);
        if (!hits || hits.length === 0)
            return undefined;
        const parts = hits
            .filter((h) => h.score > 0)
            .map((h) => `### ${h.title}\n${h.snippet}`);
        if (parts.length === 0)
            return undefined;
        return `<kb_context>\n${parts.join("\n\n---\n\n")}\n</kb_context>`;
    };
    const timeout = new Promise((resolve) => {
        setTimeout(() => resolve(undefined), KB_TIMEOUT_MS);
    });
    try {
        return await Promise.race([query(), timeout]);
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=kb-query.js.map