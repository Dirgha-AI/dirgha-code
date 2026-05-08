/**
 * kb_search tool — cosine-similarity search over the local embeddings
 * index. Uses sqlite-vec's vec0 virtual table + embedding_meta sidecar.
 * Gracefully degrades when the vec extension is absent.
 *
 * Inputs accept either:
 *   - `query`: a string. We embed it via {@link selectEmbedder} (local
 *     Xenova by default, remote HTTP when `embeddingsEndpoint` is set).
 *   - `query_vector`: a pre-computed float[384] array. Backwards compat
 *     for callers that already have a vector in hand.
 */
import { openDb } from "../state/db.js";
import { selectEmbedder } from "../embeddings/select.js";
import { loadConfig } from "../cli/config.js";
export const kbSearchTool = {
    name: "kb_search",
    description: "Cosine-similarity search over the local embeddings index. " +
        "Pass `query` (string — auto-embedded) or `query_vector` (number[384]). " +
        "Returns top-K chunks with source label and distance score.",
    inputSchema: {
        type: "object",
        properties: {
            query: { type: "string" },
            query_vector: { type: "array", items: { type: "number" } },
            k: { type: "integer", minimum: 1, maximum: 50 },
            source_prefix: { type: "string" },
        },
    },
    async execute(rawInput, _ctx) {
        const input = rawInput;
        const hasVector = Array.isArray(input.query_vector) && input.query_vector.length > 0;
        const hasQuery = typeof input.query === "string" && input.query.trim() !== "";
        if (!hasVector && !hasQuery) {
            return {
                content: "kb_search requires either `query` (string) or `query_vector` (non-empty number[]).",
                isError: true,
            };
        }
        let queryVector;
        if (hasVector) {
            queryVector = input.query_vector;
        }
        else {
            // Embed the query string. Failures here are fatal — the caller
            // asked us to search by text and we can't.
            try {
                const config = await loadConfig();
                const embedder = selectEmbedder(config);
                const vectors = await embedder.embed([input.query]);
                if (!vectors[0] || vectors[0].length === 0) {
                    return {
                        content: "kb_search failed: embedder returned empty vector",
                        isError: true,
                    };
                }
                queryVector = vectors[0];
            }
            catch (err) {
                return {
                    content: `kb_search failed to embed query: ${err.message}`,
                    isError: true,
                };
            }
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
            const vec = JSON.stringify(queryVector);
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