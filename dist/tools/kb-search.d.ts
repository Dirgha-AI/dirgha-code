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
import type { Tool } from "./registry.js";
export declare const kbSearchTool: Tool;
