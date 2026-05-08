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
export declare function selectEmbedder(input?: SelectEmbedderInput | DirghaConfig | undefined): EmbeddingAdapter;
