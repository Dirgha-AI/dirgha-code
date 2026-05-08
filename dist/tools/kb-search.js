/**
 * kb_search tool — cosine-similarity search over the local embeddings
 * index. Uses sqlite-vec's vec0 virtual table + embedding_meta sidecar.
 * Gracefully degrades when the vec extension is absent.
 */
import { openDb } from "../state/db.js";
export const kbSearchTool = {
    name: "kb_search",
    description: "Cosine-similarity search over the local embeddings index. " +
        "Returns top-K chunks with their source label and distance score.",
    inputSchema: {
        type: "object",
        properties: {
            query_vector: { type: "array", items: { type: "number" } },
            k: { type: "integer", minimum: 1, maximum: 50 },
            source_prefix: { type: "string" },
        },
        required: ["query_vector"],
    },
    async execute(rawInput, _ctx) {
        const input = rawInput;
        if (!Array.isArray(input.query_vector) || input.query_vector.length === 0) {
            return { content: "query_vector must be a non-empty array", isError: true };
        }
        const k = input.k ?? 5;
        let db;
        try {
            db = openDb();
        }
        catch (err) {
            return {
                content: `kb_search failed: db unavailable: ${err.message}`,
                isError: true,
            };
        }
        try {
            const vec = JSON.stringify(input.query_vector);
            const sql = input.source_prefix
                ? `
          SELECT m.id, m.source, m.chunk, e.distance
          FROM embeddings e
          JOIN embedding_meta m ON m.id = e.rowid
          WHERE e.embedding MATCH ? AND m.source LIKE ? || '%'
            AND k = ?
          ORDER BY e.distance
        `
                : `
          SELECT m.id, m.source, m.chunk, e.distance
          FROM embeddings e
          JOIN embedding_meta m ON m.id = e.rowid
          WHERE e.embedding MATCH ? AND k = ?
          ORDER BY e.distance
        `;
            const params = input.source_prefix
                ? [vec, input.source_prefix, k]
                : [vec, k];
            const hits = db.prepare(sql).all(...params);
            const summary = hits.length === 0
                ? "no matches"
                : hits
                    .map((h, i) => `${i + 1}. [${h.source}] dist=${h.distance.toFixed(4)} :: ${h.chunk.slice(0, 200)}`)
                    .join("\n");
            return { content: summary, data: hits, isError: false };
        }
        catch (err) {
            return {
                content: `kb_search failed: ${err.message}`,
                isError: true,
            };
        }
    },
};
//# sourceMappingURL=kb-search.js.map