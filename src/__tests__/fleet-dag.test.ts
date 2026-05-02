import { describe, it, expect, vi } from "vitest";
import { runDag } from "../fleet/dag.js";
import type { ProviderRegistry } from "../providers/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { DirghaConfig } from "../cli/config.js";
import type {
  Provider,
  StreamRequest,
  AgentEvent,
  ImageGenRequest,
  ImageGenResult,
} from "../kernel/types.js";
import { createToolRegistry } from "../tools/index.js";

function makeMockProvider(modelName = "test-model"): Provider {
  return {
    id: "test",
    supportsTools: () => true,
    supportsThinking: () => false,
    stream: async function* (req: StreamRequest): AsyncIterable<AgentEvent> {
      yield { type: "text_start" };
      yield {
        type: "text_delta",
        delta: `handled: ${req.messages[req.messages.length - 1]?.content}`,
      };
      yield { type: "text_end" };
      yield { type: "usage", inputTokens: 5, outputTokens: 10 };
    },
  };
}

const mockProvider = makeMockProvider();

const mockProviders: ProviderRegistry = {
  forModel: () => mockProvider,
  list: () => [{ id: "test", label: "Test", authEnv: "TEST_KEY" }],
  configured: () => [{ id: "test", label: "Test", authEnv: "TEST_KEY" }],
} as unknown as ProviderRegistry;

const mockConfig: DirghaConfig = {
  schemaVersion: 1,
  model: "test-model",
  cheapModel: "test-model",
  summaryModel: "test-model",
  maxTurns: 8,
  showThinking: false,
  autoApproveTools: [],
  skills: { enabled: false },
  smartRoute: { enabled: false },
  compaction: { triggerTokens: 64000, preserveLastTurns: 4 },
  telemetry: { enabled: false },
};

const mockRegistry = createToolRegistry([]);

describe("fleet dag", () => {
  it("runs a single step", async () => {
    const result = await runDag({
      steps: [{ goal: "say hello" }],
      config: mockConfig,
      providers: mockProviders,
      registry: mockRegistry,
      cwd: "/tmp",
      maxTurnsPerStep: 1,
    });

    expect(result.success).toBe(true);
    expect(result.steps.length).toBe(1);
    expect(result.steps[0]!.output).toContain("handled:");
  });

  it("runs chained steps with context propagation", async () => {
    const result = await runDag({
      steps: [{ goal: "step one" }, { goal: "step two" }],
      config: mockConfig,
      providers: mockProviders,
      registry: mockRegistry,
      cwd: "/tmp",
      maxTurnsPerStep: 1,
    });

    expect(result.success).toBe(true);
    expect(result.steps.length).toBe(2);
    expect(result.steps[1]!.output).toContain("step one");
    expect(result.steps[1]!.output).toContain("step two");
  });

  it("accumulates usage across steps", async () => {
    const result = await runDag({
      steps: [{ goal: "a" }, { goal: "b" }],
      config: mockConfig,
      providers: mockProviders,
      registry: mockRegistry,
      cwd: "/tmp",
      maxTurnsPerStep: 1,
    });

    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(20);
  });

  it("stops on error in a step", async () => {
    const errorProvider: Provider = {
      id: "error",
      supportsTools: () => false,
      supportsThinking: () => false,
      stream: async function* () {
        throw new Error("step failed");
      },
    };

    const errorProviders: ProviderRegistry = {
      forModel: () => errorProvider,
      list: () => [],
      configured: () => [],
    } as unknown as ProviderRegistry;

    const result = await runDag({
      steps: [{ goal: "will fail" }, { goal: "never runs" }],
      config: mockConfig,
      providers: errorProviders,
      registry: mockRegistry,
      cwd: "/tmp",
      maxTurnsPerStep: 1,
    });

    expect(result.success).toBe(false);
    expect(result.steps.length).toBe(1);
  });
});
