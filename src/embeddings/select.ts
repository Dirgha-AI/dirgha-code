/**
 * Embedder selection.
 *
 * Precedence (highest first):
 *   1. config.embeddingsEndpoint  → RemoteEmbedder
 *   2. @xenova/transformers loadable → LocalEmbedder
 *   3. throw a helpful error
 *
 * The selection happens at call-time, not at process start, so cold dirgha
 * startup is unaffected by the choice. Callers receive a fully-constructed
 * adapter; they do NOT need to handle the precedence themselves.
 */

import type { DirghaConfig } from "../cli/config.js";
import { isLocalEmbeddingAvailable, LocalEmbedder } from "./local.js";
import { RemoteEmbedder } from "./remote.js";
import type { EmbeddingAdapter } from "./iface.js";

export interface SelectEmbedderInput {
  embeddingsEndpoint?: string;
  embeddingsBearerToken?: string;
}

/**
 * Returns an EmbeddingAdapter chosen according to the documented
 * precedence. Throws when no adapter can be configured — callers should
 * surface the message verbatim; it points the user at the fix.
 */
export function selectEmbedder(
  input: SelectEmbedderInput | DirghaConfig | undefined = {},
): EmbeddingAdapter {
  const endpoint =
    (input as SelectEmbedderInput).embeddingsEndpoint ??
    process.env["DIRGHA_EMBEDDINGS_ENDPOINT"];
  const bearer =
    (input as SelectEmbedderInput).embeddingsBearerToken ??
    process.env["DIRGHA_EMBEDDINGS_TOKEN"];

  if (endpoint && typeof endpoint === "string" && endpoint.trim() !== "") {
    return new RemoteEmbedder({
      endpoint: endpoint.trim(),
      bearerToken: bearer,
    });
  }

  if (isLocalEmbeddingAvailable()) {
    return new LocalEmbedder();
  }

  throw new Error(
    "No embedder configured. Either: (a) install @xenova/transformers " +
      "(reinstall dirgha without --omit=optional), or (b) set " +
      "embeddingsEndpoint in ~/.dirgha/config.json (or the " +
      "DIRGHA_EMBEDDINGS_ENDPOINT env var). See docs/cli/embeddings.md.",
  );
}
