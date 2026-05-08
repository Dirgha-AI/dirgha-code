/**
 * Local embedding adapter — Xenova/transformers.js, all-MiniLM-L6-v2.
 *
 * The package is an OPTIONAL dependency. The CLI must run when it isn't
 * installed (npm install --omit=optional, sandboxed CI, restricted hosts).
 * Every entry point here guards the require() and degrades to a clear
 * "not available" signal so the caller can fall back to a remote adapter
 * or a helpful error.
 *
 * The model itself (~25MB) is cached on disk at ~/.dirgha/models/ on first
 * use; subsequent calls reload from disk in ~50ms. We deliberately do NOT
 * preload at process start — load happens on the first embed() call so
 * cold dirgha startup stays fast.
 */
import { type EmbeddingAdapter } from "./iface.js";
/** Returns true when @xenova/transformers can be loaded in this process. */
export declare function isLocalEmbeddingAvailable(): boolean;
export declare class LocalEmbedder implements EmbeddingAdapter {
    readonly provider: "local";
    available(): Promise<boolean>;
    embed(texts: string[]): Promise<number[][]>;
}
/** Reset module-scope caches. Tests only. */
export declare function _resetLocalEmbedderForTests(): void;
