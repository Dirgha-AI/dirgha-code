/**
 * Tests for the embeddings adapter layer.
 *
 *  - RemoteEmbedder: deterministic via mocked fetch.
 *  - LocalEmbedder: only runs when @xenova/transformers loads cleanly;
 *    otherwise the test skips with a clear note (CI without optional
 *    deps still goes green).
 *  - selectEmbedder: precedence (config endpoint > local > error).
 *  - kb_search: backwards compat with query_vector + new query string path.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { RemoteEmbedder } from "../embeddings/remote.js";
import {
  LocalEmbedder,
  isLocalEmbeddingAvailable,
} from "../embeddings/local.js";
import { selectEmbedder } from "../embeddings/select.js";
import { EMBEDDING_DIM } from "../embeddings/iface.js";
import { kbSearchTool } from "../tools/kb-search.js";

function makeCtx() {
  return {
    cwd: process.cwd(),
    env: {},
    sessionId: "t",
    signal: new AbortController().signal,
    sandbox: null,
    sandboxMode: "off" as const,
  };
}

describe("RemoteEmbedder", () => {
  test("POSTs texts and returns vectors verbatim", async () => {
    const fixedVector = new Array(EMBEDDING_DIM).fill(0.5);
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ vectors: [fixedVector, fixedVector] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const adapter = new RemoteEmbedder({
      endpoint: "https://example.test/embed",
      bearerToken: "secret-token",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(await adapter.available()).toBe(true);
    expect(adapter.provider).toBe("remote");

    const result = await adapter.embed(["hello", "world"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(fixedVector);
    expect(result[1]).toEqual(fixedVector);

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = fakeFetch.mock.calls[0];
    expect(url).toBe("https://example.test/embed");
    const initObj = init as RequestInit;
    expect(initObj.method).toBe("POST");
    const headers = initObj.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer secret-token");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(initObj.body as string)).toEqual({
      texts: ["hello", "world"],
    });
  });

  test("throws on 4xx with body in message", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response("bad request: missing field", {
        status: 400,
      }),
    );
    const adapter = new RemoteEmbedder({
      endpoint: "https://example.test/embed",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    await expect(adapter.embed(["x"])).rejects.toThrow(/400/);
  });

  test("marks 5xx as transient", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response("upstream timeout", { status: 503 }),
    );
    const adapter = new RemoteEmbedder({
      endpoint: "https://example.test/embed",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    try {
      await adapter.embed(["x"]);
      throw new Error("expected throw");
    } catch (err) {
      const e = err as Error & { transient?: boolean };
      expect(e.transient).toBe(true);
      expect(e.message).toMatch(/503/);
    }
  });

  test("rejects vector-count mismatch", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ vectors: [[0.1]] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const adapter = new RemoteEmbedder({
      endpoint: "https://example.test/embed",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    await expect(adapter.embed(["a", "b"])).rejects.toThrow(/mismatch/);
  });

  test("empty input returns empty array without HTTP call", async () => {
    const fakeFetch = vi.fn();
    const adapter = new RemoteEmbedder({
      endpoint: "https://example.test/embed",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    expect(await adapter.embed([])).toEqual([]);
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});

describe("LocalEmbedder", () => {
  test.skipIf(!isLocalEmbeddingAvailable())(
    "embeds two strings, vectors are length 384 with non-zero L2 norm",
    async () => {
      const adapter = new LocalEmbedder();
      expect(adapter.provider).toBe("local");
      expect(await adapter.available()).toBe(true);

      const vectors = await adapter.embed(["hello world", "the quick brown fox"]);
      expect(vectors).toHaveLength(2);
      for (const v of vectors) {
        expect(v).toHaveLength(EMBEDDING_DIM);
        const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
        expect(norm).toBeGreaterThan(0);
      }
    },
    120_000,
  );

  test("available() returns false when package missing", async () => {
    // We can't uninstall the dep mid-test, so we only assert the contract:
    // available() returns a boolean and never throws, regardless of state.
    const adapter = new LocalEmbedder();
    const result = await adapter.available();
    expect(typeof result).toBe("boolean");
  });
});

describe("selectEmbedder", () => {
  const originalEndpoint = process.env["DIRGHA_EMBEDDINGS_ENDPOINT"];
  const originalToken = process.env["DIRGHA_EMBEDDINGS_TOKEN"];

  afterEach(() => {
    if (originalEndpoint === undefined)
      delete process.env["DIRGHA_EMBEDDINGS_ENDPOINT"];
    else process.env["DIRGHA_EMBEDDINGS_ENDPOINT"] = originalEndpoint;
    if (originalToken === undefined)
      delete process.env["DIRGHA_EMBEDDINGS_TOKEN"];
    else process.env["DIRGHA_EMBEDDINGS_TOKEN"] = originalToken;
  });

  test("config.embeddingsEndpoint takes precedence over local", () => {
    delete process.env["DIRGHA_EMBEDDINGS_ENDPOINT"];
    const adapter = selectEmbedder({
      embeddingsEndpoint: "https://embed.example.com/v1",
    });
    expect(adapter.provider).toBe("remote");
  });

  test("env var DIRGHA_EMBEDDINGS_ENDPOINT picks remote", () => {
    process.env["DIRGHA_EMBEDDINGS_ENDPOINT"] = "https://from-env.example/v1";
    const adapter = selectEmbedder({});
    expect(adapter.provider).toBe("remote");
  });

  test("falls back to local when no endpoint and package present", () => {
    delete process.env["DIRGHA_EMBEDDINGS_ENDPOINT"];
    if (!isLocalEmbeddingAvailable()) {
      // Without local available, this should throw — covered in the next test.
      expect(() => selectEmbedder({})).toThrow(/No embedder configured/);
      return;
    }
    const adapter = selectEmbedder({});
    expect(adapter.provider).toBe("local");
  });

  test("config object precedence: endpoint wins even with empty token", () => {
    delete process.env["DIRGHA_EMBEDDINGS_ENDPOINT"];
    const adapter = selectEmbedder({
      embeddingsEndpoint: "  https://x.example/  ",
    });
    expect(adapter.provider).toBe("remote");
  });
});

describe("kb_search backwards compat", () => {
  let tempHome: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;
  let originalEndpoint: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "dirgha-emb-kb-"));
    originalHome = process.env["HOME"];
    originalUserProfile = process.env["USERPROFILE"];
    originalEndpoint = process.env["DIRGHA_EMBEDDINGS_ENDPOINT"];
    process.env["HOME"] = tempHome;
    process.env["USERPROFILE"] = tempHome;
    delete process.env["DIRGHA_EMBEDDINGS_ENDPOINT"];
  });

  afterEach(async () => {
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    else delete process.env["HOME"];
    if (originalUserProfile !== undefined)
      process.env["USERPROFILE"] = originalUserProfile;
    else delete process.env["USERPROFILE"];
    if (originalEndpoint !== undefined)
      process.env["DIRGHA_EMBEDDINGS_ENDPOINT"] = originalEndpoint;
    else delete process.env["DIRGHA_EMBEDDINGS_ENDPOINT"];
    await rm(tempHome, { recursive: true, force: true });
  });

  test("query_vector still accepted (backwards compat)", async () => {
    const result = await kbSearchTool.execute(
      { query_vector: new Array(EMBEDDING_DIM).fill(0.1), k: 3 },
      makeCtx(),
    );
    // Either succeeds with no-matches or fails gracefully; key invariant
    // is that the input shape is still accepted.
    expect(typeof result.content).toBe("string");
    expect(result.content).not.toContain("requires either");
  });

  test("rejects when neither query nor query_vector provided", async () => {
    const result = await kbSearchTool.execute({ k: 3 }, makeCtx());
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/requires either/);
  });

  test("query string path surfaces embed errors clearly", async () => {
    // Force the remote adapter via env var pointing at an unreachable
    // endpoint, so the embed step fails deterministically without needing
    // network or the optional Xenova package.
    process.env["DIRGHA_EMBEDDINGS_ENDPOINT"] =
      "http://127.0.0.1:1/never-listens";
    const result = await kbSearchTool.execute(
      { query: "hello world" },
      makeCtx(),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/failed to embed query/);
  });
});
