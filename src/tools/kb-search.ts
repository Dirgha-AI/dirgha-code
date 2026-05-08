/**
 * kb_search tool — cosine-similarity search over the local embeddings
 * index. Uses sqlite-vec's vec0 virtual table + embedding_meta sidecar.
 * Gracefully degrades when the vec extension is absent.
 */

import type { Tool } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";
import { openDb } from "../state/db.js";

interface Input {
  query_vector: number[];
  k?: number;
  source_prefix?: string;
}

interface Hit {
  id: number;
  source: string;
  chunk: string;
  distance: number;
}

export const kbSearchTool: Tool = {
  name: "kb_search",
  description:
    "Cosine-similarity search over the local embeddings index. " +
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
  async execute(rawInput: unknown, _ctx): Promise<ToolResult<Hit[]>> {
    const input = rawInput as Input;
    if (!Array.isArray(input.query_vector) || input.query_vector.length === 0) {
      return { content: "query_vector must be a non-empty array", isError: true };
    }
    const k = input.k ?? 5;

    let db: ReturnType<typeof openDb>;
    try {
      db = openDb();
    } catch (err) {
      return {
        content: `kb_search failed: db unavailable: ${(err as Error).message}`,
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
      const hits = db.prepare(sql).all(...params) as Hit[];
      const summary =
        hits.length === 0
          ? "no matches"
          : hits
              .map(
                (h, i) =>
                  `${i + 1}. [${h.source}] dist=${h.distance.toFixed(4)} :: ${h.chunk.slice(0, 200)}`,
              )
              .join("\n");
      return { content: summary, data: hits, isError: false };
    } catch (err) {
      return {
        content: `kb_search failed: ${(err as Error).message}`,
        isError: true,
      };
    }
  },
};
