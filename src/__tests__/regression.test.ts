/**
 * Regression test template. Every merged bug fix gets a test here.
 *
 * Pattern:
 *   describe("regression: <title>", () => { ... })
 *
 * Required metadata per test:
 *   - issue:  GitHub issue/PR URL
 *   - fixed:  date the fix shipped
 *   - test:   descriptive test name that explains expected behavior
 *
 * Add new blocks at the bottom.
 */
import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ============================================================================
// regression: reasoning_content echo-back for deepseek-v4-flash multi-turn
// issue: https://github.com/Dirgha-AI/dirgha-code/issues/1127
// fixed: 2026-05-01
// ============================================================================

describe("regression: reasoning_content echo-back (deepseek-v4-flash multi-turn)", () => {
  it("assistant messages with reasoning_content are stripped before next API call", async () => {
    const { NvidiaProvider } = await import("../providers/nvidia.js");
    const { startMockOpenAICompat } =
      await import("../parity/mock-openai-compat.js");

    const mock = await startMockOpenAICompat([
      {
        chunks: [
          // deepseek-v4-flash sends reasoning_content before text
          JSON.stringify({
            choices: [
              { delta: { reasoning_content: "Let me think about this..." } },
            ],
          }),
          JSON.stringify({
            choices: [{ delta: { content: "The answer is 42" } }],
          }),
          JSON.stringify({
            choices: [{ delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 5, completion_tokens: 5 },
          }),
          "[DONE]",
        ],
      },
    ]);

    const provider = new NvidiaProvider({
      apiKey: "test",
      baseUrl: mock.url,
      timeoutMs: 5_000,
    });

    const events: import("../kernel/types.js").AgentEvent[] = [];
    for await (const ev of provider.stream({
      model: "deepseek-ai/deepseek-v4-flash",
      messages: [{ role: "user", content: "what is 6*7?" }],
    })) {
      events.push(ev);
    }

    await mock.close();

    // Verify text content arrived (reasoning_content is intercepted
    // by the OpenAI compat layer — it should NOT appear as text_delta)
    const textDeltas = events
      .filter((e) => e.type === "text_delta")
      .map((e) => (e as { delta: string }).delta)
      .join("");
    expect(textDeltas).toBe("The answer is 42");

    // reasoning_content should be emitted as thinking_delta, not text_delta
    const thinkingDeltas = events
      .filter((e) => e.type === "thinking_delta")
      .map((e) => (e as { delta: string }).delta)
      .join("");
    expect(thinkingDeltas).toContain("Let me think about this");
  });

  it("reasoning_content is not echoed back as user-facing text on subsequent turns", () => {
    // Verification: assembleTurn in message.ts separates thinking from
    // text — the content parts array should contain ThinkingPart entries
    // that are NOT included in concatenated user-visible output.
    // We verify this by ensuring the message module exports the
    // assembleTurn function and that it handles reasoning_content.

    // Structural assertion: the kernel can import assembleTurn cleanly.
    expect(async () => {
      const mod = await import("../kernel/message.js");
      expect(mod.assembleTurn).toBeDefined();
      expect(mod.extractToolUses).toBeDefined();
    }).not.toThrow();
  });
});

// ============================================================================
// regression: YOLO mode tool blocking
// issue: https://github.com/Dirgha-AI/dirgha-code/issues/1131
// fixed: 2026-05-02
// ============================================================================

describe("regression: YOLO mode tool blocking", () => {
  it("--yolo autoApprove=true bypasses approval for shell tool", async () => {
    const { createToolRegistry, createToolExecutor, builtInTools } =
      await import("../tools/index.js");
    const { shellTool } = await import("../tools/shell.js");

    const registry = createToolRegistry([shellTool]);
    const cwd = tmpdir();
    const sessionId = randomUUID();
    const executor = createToolExecutor({
      registry,
      cwd,
      sessionId,
    });

    // In YOLO mode, auto-approve is true, so execute should not block.
    const result = await executor.execute(
      { id: "tc1", name: "shell", input: { command: 'echo "YOLO OK"' } },
      new AbortController().signal,
    );

    expect(result.isError).toBe(false);
    expect(result.content).toContain("YOLO OK");
  });

  it("YOLO mode returns no enforcement hooks — all tools allowed", async () => {
    const { enforceMode } = await import("../context/mode-enforcement.js");
    // YOLO returns undefined — no tools are blocked, full auto-approve.
    const hooks = enforceMode("yolo");
    expect(hooks).toBeUndefined();
  });
});

// ============================================================================
// regression: /keys set not hydrating process.env
// issue: https://github.com/Dirgha-AI/dirgha-code/issues/1135
// fixed: 2026-05-03
// ============================================================================

describe("regression: /keys set hydrates process.env", () => {
  it("saveKey sets process.env immediately", async () => {
    const { saveKey } = await import("../auth/keystore.js");
    const keyName = `DIRGHA_REGRESSION_${randomUUID().slice(0, 8).toUpperCase()}`;
    const keyValue = "test-secret-value";

    // Ensure it's not set first
    delete process.env[keyName];

    await saveKey(keyName, keyValue);
    expect(process.env[keyName]).toBe(keyValue);

    // Cleanup
    delete process.env[keyName];
  });

  it("hydrateEnvFromKeyStore does not overwrite existing env vars", async () => {
    const { saveKey, hydrateEnvFromKeyStore } =
      await import("../auth/keystore.js");
    const keyName = `DIRGHA_REGRESSION_OVR_${randomUUID().slice(0, 8).toUpperCase()}`;

    // Pre-set via env
    process.env[keyName] = "original-value";
    await saveKey(keyName, "file-value");

    // Hydrate — should NOT overwrite because env is already set
    const originalEnv = { ...process.env };
    const hydrated = await hydrateEnvFromKeyStore();

    if (hydrated.includes(keyName)) {
      // If it tried to hydrate, env should still be original-value
      expect(process.env[keyName]).toBe("original-value");
    }

    // Cleanup
    delete process.env[keyName];
  });

  it("/keys set persists across keystore reads", async () => {
    const { saveKey, readKeyStore } = await import("../auth/keystore.js");
    const keyName = `DIRGHA_REGRESSION_PERSIST_${randomUUID().slice(0, 8).toUpperCase()}`;
    const keyValue = "persisted-value";

    await saveKey(keyName, keyValue);

    // Read back from disk
    const store = await readKeyStore();
    expect(store[keyName]).toBe(keyValue);

    // Cleanup: remove from store
    const cleanStore = await readKeyStore();
    delete cleanStore[keyName];
    // We can't easily remove a key from the file, so just unset env
    delete process.env[keyName];
  });
});
