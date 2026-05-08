/**
 * Embedding adapter interface.
 *
 * Two adapters live behind this surface today: a local Xenova/transformers.js
 * adapter that runs all-MiniLM-L6-v2 inside the dirgha process (no external
 * API call, ~25MB cached at ~/.dirgha/models/), and a remote HTTP adapter
 * that POSTs to a user-configured endpoint. Both produce 384-dim vectors so
 * downstream cosine-similarity search is identical.
 *
 * The adapter is selected at call-time via {@link selectEmbedder}; nothing
 * preloads at process start, keeping cold startup fast.
 */
/** Dimensionality of the canonical Dirgha embedding space. */
export const EMBEDDING_DIM = 384;
//# sourceMappingURL=iface.js.map