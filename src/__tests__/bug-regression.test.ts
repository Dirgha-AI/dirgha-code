import { describe, it, expect } from "vitest";
import { routeModel } from "../providers/dispatch.js";

describe("dispatch — DeepSeek model routing regression", () => {
  it("routes deepseek-v4-flash to deepseek provider", () => {
    expect(routeModel("deepseek-v4-flash")).toBe("deepseek");
  });

  it("routes deepseek-chat to deepseek provider", () => {
    expect(routeModel("deepseek-chat")).toBe("deepseek");
  });

  it("routes deepseek-reasoner to deepseek provider", () => {
    expect(routeModel("deepseek-reasoner")).toBe("deepseek");
  });

  it("routes deepseek-v4-pro to deepseek provider", () => {
    expect(routeModel("deepseek-v4-pro")).toBe("deepseek");
  });

  it("routes deepseek-prover-v2 to deepseek provider", () => {
    expect(routeModel("deepseek-prover-v2")).toBe("deepseek");
  });

  it("routes deepseek-coder to deepseek provider", () => {
    expect(routeModel("deepseek-coder")).toBe("deepseek");
  });
});

describe("dispatch — other providers unchanged", () => {
  it("routes claude-sonnet-4-6 to anthropic", () => {
    expect(routeModel("claude-sonnet-4-6")).toBe("anthropic");
  });

  it("routes gpt-4o to openai", () => {
    expect(routeModel("gpt-4o")).toBe("openai");
  });

  it("routes gemini-2.5-flash to gemini", () => {
    expect(routeModel("gemini-2.5-flash")).toBe("gemini");
  });
});

describe("git tool — sep imported via ESM, no require()", () => {
  it("git tool exports gitTool without crashing", async () => {
    const mod = await import("../tools/git.js");
    expect(mod.gitTool).toBeDefined();
    expect(mod.gitTool.name).toBe("git");
  });
});

describe("wizard — DeepSeek in PROVIDERS", () => {
  it("DeepSeek is in wizard PROVIDERS", async () => {
    const { PROVIDERS } = await import("../cli/flows/wizard.js");
    const ds = PROVIDERS.find((p) => p.id === "deepseek");
    expect(ds).toBeDefined();
    expect(ds!.env).toBe("DEEPSEEK_API_KEY");
  });

  it("DeepSeek is in DEFAULT_MODEL_PER_PROVIDER", async () => {
    const { DEFAULT_MODEL_PER_PROVIDER } =
      await import("../cli/flows/wizard.js");
    expect(DEFAULT_MODEL_PER_PROVIDER).toHaveProperty("deepseek");
  });
});

describe("setup — DeepSeek in BYOK PROVIDERS", () => {
  it("DeepSeek in BYOK provider array", async () => {
    const { PROVIDERS } = await import("../cli/setup.js");
    const ds = PROVIDERS.find((p) => p.label === "DeepSeek");
    expect(ds).toBeDefined();
    expect(ds!.env).toBe("DEEPSEEK_API_KEY");
  });
});
