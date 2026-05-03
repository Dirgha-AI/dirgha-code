import { describe, expect, it } from "vitest";
import { routeModel, isKnownProvider } from "../dispatch.js";

describe("routeModel", () => {
  // Bare native IDs (no slash) → respective first-party providers.
  // These prefixes are recognised before the OpenRouter catch-all.
  describe("bare native IDs", () => {
    it("claude-sonnet-4-6 → anthropic", () => {
      expect(routeModel("claude-sonnet-4-6")).toBe("anthropic");
    });
    it("gpt-4o-mini → openai", () => {
      expect(routeModel("gpt-4o-mini")).toBe("openai");
    });
    it("o1-preview → openai", () => {
      expect(routeModel("o1-preview")).toBe("openai");
    });
    it("gemini-2.5-flash → gemini", () => {
      expect(routeModel("gemini-2.5-flash")).toBe("gemini");
    });
  });

  // The NVIDIA NIM whitelist (NVIDIA_NIM_MODELS in dispatch.ts).
  // Exact-ID match — vendor prefix alone is not enough since the same
  // prefix is shared with OpenRouter (e.g. moonshotai/kimi-k2.5 lives
  // only on OR; sending it to NIM would 404).
  describe("NVIDIA NIM whitelist", () => {
    it("moonshotai/kimi-k2.6 → nvidia", () => {
      expect(routeModel("moonshotai/kimi-k2.6")).toBe("nvidia");
    });
    it("moonshotai/kimi-k2-thinking → nvidia", () => {
      expect(routeModel("moonshotai/kimi-k2-thinking")).toBe("nvidia");
    });
    it("qwen/qwen3.5-397b-a17b → nvidia", () => {
      expect(routeModel("qwen/qwen3.5-397b-a17b")).toBe("nvidia");
    });
    it("qwen/qwen3-coder-480b-a35b-instruct → nvidia", () => {
      expect(routeModel("qwen/qwen3-coder-480b-a35b-instruct")).toBe("nvidia");
    });
    it("minimaxai/minimax-m2.7 → nvidia", () => {
      expect(routeModel("minimaxai/minimax-m2.7")).toBe("nvidia");
    });
    it("mistralai/mistral-large-3-675b-instruct-2512 → nvidia", () => {
      expect(routeModel("mistralai/mistral-large-3-675b-instruct-2512")).toBe(
        "nvidia",
      );
    });
    it("meta/llama-4-maverick-17b-128e-instruct → nvidia", () => {
      expect(routeModel("meta/llama-4-maverick-17b-128e-instruct")).toBe(
        "nvidia",
      );
    });
  });

  // Vendor-prefix explicit providers take priority over NIM catalogue.
  // deepseek-ai/ routes to native DeepSeek, not NIM.
  describe("vendor-prefix beats NIM catalogue", () => {
    it("deepseek-ai/deepseek-v4-pro → deepseek (native API, not NIM)", () => {
      expect(routeModel("deepseek-ai/deepseek-v4-pro")).toBe("deepseek");
    });
    it("deepseek-ai/deepseek-v4-flash → deepseek (native API, not NIM)", () => {
      expect(routeModel("deepseek-ai/deepseek-v4-flash")).toBe("deepseek");
    });
    it("deepseek-v4-pro → deepseek (bare ID)", () => {
      expect(routeModel("deepseek-v4-pro")).toBe("deepseek");
    });
  });

  // Prefixed IDs NOT in any catalogue fall through to OpenRouter.
  describe("prefixed IDs → openrouter", () => {
    it("anthropic/claude-opus-4-7 → openrouter", () => {
      expect(routeModel("anthropic/claude-opus-4-7")).toBe("openrouter");
    });
    it("openai/gpt-4o → openrouter", () => {
      expect(routeModel("openai/gpt-4o")).toBe("openrouter");
    });
    it("google/gemini-2.5-pro → openrouter", () => {
      expect(routeModel("google/gemini-2.5-pro")).toBe("openrouter");
    });
    it("minimaxai/minimax-m2 → nvidia (auto-migrated to -m2.7 in NIM catalogue)", () => {
      expect(routeModel("minimaxai/minimax-m2")).toBe("nvidia");
    });
    it("z-ai/glm-5.1 → zai (1.10.1: native Z.AI provider)", () => {
      // Used to fall through to openrouter; 1.10.1 added native Z.AI dispatch
      // via the explicit `z-ai/` prefix rule. Falls back to openrouter only
      // for slugs that don't start with the registered prefix.
      expect(routeModel("z-ai/glm-5.1")).toBe("zai");
    });
    it("meta/llama-3.3-70b-instruct → openrouter (3.3 not on NIM whitelist)", () => {
      expect(routeModel("meta/llama-3.3-70b-instruct")).toBe("openrouter");
    });
    it("inclusionai/ling-2.6-1t:free → openrouter", () => {
      expect(routeModel("inclusionai/ling-2.6-1t:free")).toBe("openrouter");
    });
    it("openrouter/x-ai/grok-4 → openrouter", () => {
      expect(routeModel("openrouter/x-ai/grok-4")).toBe("openrouter");
    });
  });

  // Local + explicit-prefix providers (rules 5-7).
  describe("local + explicit-prefix providers", () => {
    it("ollama/llama3 → ollama", () => {
      expect(routeModel("ollama/llama3")).toBe("ollama");
    });
    it("llamacpp/qwen3-coder-30b-a3b-instruct → llamacpp", () => {
      expect(routeModel("llamacpp/qwen3-coder-30b-a3b-instruct")).toBe(
        "llamacpp",
      );
    });
    it("fireworks/kimi-k2 → fireworks", () => {
      expect(routeModel("fireworks/kimi-k2")).toBe("fireworks");
    });
  });

  // No slash, no recognised prefix, not whitelisted → throws.
  // The catch-all rule requires `/` or `:free`; bare unknowns fall off
  // the end of the rule list and routeModel raises.
  it("throws on a bare unknown ID", () => {
    expect(() => routeModel("something-totally-unknown")).toThrow();
  });
});

describe("isKnownProvider", () => {
  it("accepts configured providers", () => {
    expect(isKnownProvider("nvidia")).toBe(true);
    expect(isKnownProvider("openrouter")).toBe(true);
    expect(isKnownProvider("anthropic")).toBe(true);
  });
  it("rejects unknown", () => {
    expect(isKnownProvider("bedrock")).toBe(false);
  });
});
