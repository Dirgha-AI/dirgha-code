/**
 * kb_search tool — cosine-similarity search over the local embeddings
 * index. Uses sqlite-vec's vec0 virtual table + embedding_meta sidecar.
 * Gracefully degrades when the vec extension is absent.
 */
import type { Tool } from "./registry.js";
export declare const kbSearchTool: Tool;
