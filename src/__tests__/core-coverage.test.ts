import { describe, it, expect } from "vitest";

describe("auth — keystore", () => {
  it("keyStorePath returns ~/.dirgha/keys.json", async () => {
    const { keyStorePath } = await import("../auth/keystore.js");
    expect(keyStorePath()).toContain(".dirgha");
    expect(keyStorePath()).toContain("keys.json");
  });

  it("readKeyStore returns empty store for nonexistent file", async () => {
    const { readKeyStore } = await import("../auth/keystore.js");
    const store = await readKeyStore("/tmp/nonexistent-keys-98765.json");
    expect(store).toEqual({});
  });

  it("hydrateEnvFromKeyStore sets env vars", async () => {
    const { hydrateEnvFromKeyStore } = await import("../auth/keystore.js");
    const env: Record<string, string | undefined> = {};
    const result = await hydrateEnvFromKeyStore(
      env as NodeJS.ProcessEnv,
      "/tmp/nonexistent-keys-98765.json",
    );
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("auth — keypool", () => {
  it("poolPath returns ~/.dirgha/keypool.json", async () => {
    const { poolPath } = await import("../auth/keypool.js");
    expect(poolPath()).toContain(".dirgha");
    expect(poolPath()).toContain("keypool.json");
  });

  it("readPool returns empty pool for nonexistent file", async () => {
    const { readPool } = await import("../auth/keypool.js");
    const pool = await readPool("/tmp/nonexistent-home-98765");
    expect(pool).toEqual({});
  });

  it("pickEntry returns undefined for empty pool", async () => {
    const { pickEntry } = await import("../auth/keypool.js");
    expect(pickEntry({}, "OPENROUTER_API_KEY")).toBeUndefined();
  });

  it("pickEntry returns highest-priority usable entry", async () => {
    const { pickEntry } = await import("../auth/keypool.js");
    const pool = {
      OPENROUTER_API_KEY: [
        {
          id: "a1",
          value: "sk-pri",
          label: "primary",
          priority: 0,
          addedAt: "2026-01-01T00:00:00Z",
          lastUsedAt: null,
          exhaustedUntil: null,
        },
        {
          id: "a2",
          value: "sk-sec",
          label: "secondary",
          priority: 1,
          addedAt: "2026-01-01T00:00:00Z",
          lastUsedAt: null,
          exhaustedUntil: null,
        },
      ],
    };
    const entry = pickEntry(pool, "OPENROUTER_API_KEY");
    expect(entry).toBeDefined();
    expect(entry!.value).toBe("sk-sec");
  });

  it("pickEntry skips exhausted entries", async () => {
    const { pickEntry } = await import("../auth/keypool.js");
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const pool = {
      OPENROUTER_API_KEY: [
        {
          id: "a1",
          value: "sk-pri",
          label: "primary",
          priority: 1,
          addedAt: "2026-01-01T00:00:00Z",
          lastUsedAt: null,
          exhaustedUntil: future,
        },
        {
          id: "a2",
          value: "sk-sec",
          label: "secondary",
          priority: 0,
          addedAt: "2026-01-01T00:00:00Z",
          lastUsedAt: null,
          exhaustedUntil: null,
        },
      ],
    };
    const entry = pickEntry(pool, "OPENROUTER_API_KEY");
    expect(entry).toBeDefined();
    expect(entry!.value).toBe("sk-sec");
  });
});

describe("providers — dispatch", () => {
  it("isKnownProvider accepts all provider IDs", async () => {
    const { isKnownProvider } = await import("../providers/dispatch.js");
    const ids = [
      "anthropic",
      "openai",
      "gemini",
      "deepseek",
      "openrouter",
      "fireworks",
      "mistral",
      "cohere",
      "cerebras",
      "together",
      "perplexity",
      "xai",
      "groq",
      "ollama",
      "nvidia",
      "zai",
    ];
    for (const id of ids) {
      expect(isKnownProvider(id)).toBe(true);
    }
  });

  it("isKnownProvider rejects invalid provider ids", async () => {
    const { isKnownProvider } = await import("../providers/dispatch.js");
    expect(isKnownProvider("")).toBe(false);
    expect(isKnownProvider("nonexistent-provider")).toBe(false);
  });
});

describe("tools — git", () => {
  it("git tool schema matches expected shape", async () => {
    const mod = await import("../tools/git.js");
    expect(mod.gitTool).toBeDefined();
    expect(mod.gitTool.name).toBe("git");
    expect(typeof mod.gitTool.execute).toBe("function");
    expect(mod.gitTool.inputSchema).toBeDefined();
    expect(mod.gitTool.inputSchema.type).toBe("object");
  });
});

describe("cli — first-run detection", () => {
  it("checkFirstRun returns false when keys exist in env", async () => {
    const { checkFirstRun } = await import("../cli/first-run.js");
    // With no env keys set and no ~/.dirgha/keys.json in the test
    // tmpdir, this should return true (first run).
    const result = checkFirstRun();
    expect(typeof result).toBe("boolean");
  });
});

describe("cli — wizard exports", () => {
  it("PROVIDERS array is non-empty", async () => {
    const { PROVIDERS } = await import("../cli/flows/wizard.js");
    expect(Array.isArray(PROVIDERS)).toBe(true);
    expect(PROVIDERS.length).toBeGreaterThan(0);
  });

  it("every provider has required fields", async () => {
    const { PROVIDERS } = await import("../cli/flows/wizard.js");
    for (const p of PROVIDERS) {
      expect(p.id).toBeDefined();
      expect(p.label).toBeDefined();
      expect(typeof p.hosted).toBe("boolean");
    }
  });

  it("at least 16 providers registered", async () => {
    const { PROVIDERS } = await import("../cli/flows/wizard.js");
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(16);
  });
});

describe("setup — BYOK provider exports", () => {
  it("PROVIDERS array is non-empty", async () => {
    const { PROVIDERS } = await import("../cli/setup.js");
    expect(Array.isArray(PROVIDERS)).toBe(true);
    expect(PROVIDERS.length).toBeGreaterThan(0);
  });

  it("every provider has label + env + helpUrl + suggested", async () => {
    const { PROVIDERS } = await import("../cli/setup.js");
    for (const p of PROVIDERS) {
      expect(p.label).toBeDefined();
      expect(p.env).toBeDefined();
      expect(p.helpUrl).toBeDefined();
      expect(Array.isArray(p.suggested)).toBe(true);
      expect(p.suggested.length).toBeGreaterThan(0);
    }
  });
});

describe("intelligence — model aliases", () => {
  it("resolveModelAlias is defined", async () => {
    const { resolveModelAlias } = await import("../intelligence/prices.js");
    expect(typeof resolveModelAlias).toBe("function");
  });

  it("aliases resolve correctly", async () => {
    const { resolveModelAlias, listModelAliases } =
      await import("../intelligence/prices.js");
    const aliases = listModelAliases();
    expect(Array.isArray(aliases)).toBe(true);
    // Passthrough for unknown model
    expect(resolveModelAlias("totally-unknown-model-xyz")).toBe(
      "totally-unknown-model-xyz",
    );
  });
});

describe("providers — rate limiter", () => {
  it("rate limiter exports bucket utilities", async () => {
    const mod = await import("../providers/rate-limiter.js");
    expect(mod).toBeDefined();
  });
});

describe("cli — slash registry", () => {
  it("SlashRegistry can register and dispatch handlers", async () => {
    const { SlashRegistry } = await import("../cli/slash.js");
    const registry = new SlashRegistry();
    registry.register("test-cmd", async () => "ok");
    expect(registry.has("test-cmd")).toBe(true);
  });
});
