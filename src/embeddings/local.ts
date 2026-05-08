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

import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { EMBEDDING_DIM, type EmbeddingAdapter } from "./iface.js";

const _require = createRequire(import.meta.url);

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

/**
 * Lazily resolved transformers.js handle. Null until first embed() call.
 * Held module-scope so multiple adapter instances share one pipeline.
 */
let _transformers: typeof import("@xenova/transformers") | null = null;
let _resolved = false;

function tryRequire(): typeof import("@xenova/transformers") | null {
  if (_resolved) return _transformers;
  _resolved = true;
  try {
    _transformers = _require(
      "@xenova/transformers",
    ) as typeof import("@xenova/transformers");
  } catch {
    _transformers = null;
  }
  return _transformers;
}

/** Returns true when @xenova/transformers can be loaded in this process. */
export function isLocalEmbeddingAvailable(): boolean {
  return tryRequire() !== null;
}

let _pipelinePromise: Promise<unknown> | null = null;

async function getPipeline(): Promise<
  // The pipeline object is a callable function with extra fields; we
  // only need the call signature so a minimal type is enough.
  (
    text: string | string[],
    opts?: { pooling?: string; normalize?: boolean },
  ) => Promise<{ data: Float32Array | number[]; dims?: number[] }>
> {
  const tx = tryRequire();
  if (!tx) {
    throw new Error(
      "@xenova/transformers is not installed. Reinstall dirgha without --omit=optional, " +
        "or configure embeddingsEndpoint to use a remote embedder.",
    );
  }

  if (!_pipelinePromise) {
    // Cache the model on disk under ~/.dirgha/models so the ~25MB download
    // is paid at most once per machine, not once per dirgha invocation.
    const modelsDir = join(homedir(), ".dirgha", "models");
    try {
      mkdirSync(modelsDir, { recursive: true });
    } catch {
      /* best-effort; transformers.js will fall back to its own cache */
    }
    // env is the runtime config; fields are intentionally untyped on the
    // public surface. The cast keeps strict mode happy without dragging
    // the full type into our public interface.
    const env = (tx as unknown as { env: Record<string, unknown> }).env;
    if (env) {
      env.cacheDir = modelsDir;
      env.localModelPath = modelsDir;
    }
    _pipelinePromise = (
      tx as unknown as {
        pipeline: (
          task: string,
          model: string,
        ) => Promise<unknown>;
      }
    ).pipeline("feature-extraction", MODEL_ID);
  }
  return _pipelinePromise as Promise<
    (
      text: string | string[],
      opts?: { pooling?: string; normalize?: boolean },
    ) => Promise<{ data: Float32Array | number[]; dims?: number[] }>
  >;
}

export class LocalEmbedder implements EmbeddingAdapter {
  readonly provider = "local" as const;

  async available(): Promise<boolean> {
    return isLocalEmbeddingAvailable();
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!Array.isArray(texts)) {
      throw new Error("embed(): texts must be an array");
    }
    if (texts.length === 0) return [];

    const pipeline = await getPipeline();
    const out = await pipeline(texts, {
      pooling: "mean",
      normalize: true,
    });
    // transformers.js returns a flat Float32Array of length N*DIM with
    // dims=[N, DIM]. Reshape to number[N][DIM] for downstream consumers.
    const flat: Float32Array | number[] = out.data;
    const dim =
      Array.isArray(out.dims) && out.dims.length >= 2
        ? out.dims[out.dims.length - 1]
        : EMBEDDING_DIM;
    const n = Math.floor(flat.length / dim);
    const result: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = new Array(dim);
      for (let j = 0; j < dim; j++) row[j] = Number(flat[i * dim + j]);
      result.push(row);
    }
    return result;
  }
}

/** Reset module-scope caches. Tests only. */
export function _resetLocalEmbedderForTests(): void {
  _transformers = null;
  _resolved = false;
  _pipelinePromise = null;
}
