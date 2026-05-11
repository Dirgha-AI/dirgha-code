import { describe, it, expect } from "vitest";

describe("gpu_list", () => {
  it("lists GPU types from static data", async () => {
    const { gpuListTool } = await import("../tools/gpu-compute.js");
    const result = await gpuListTool.execute({}, {} as any);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("A100 80GB");
    expect(result.content).toContain("$0.49/hr");
    expect(result.content).toContain("4090");
    expect(result.content).toContain("runpod");
  });

  it("filters by minVramGb", async () => {
    const { gpuListTool } = await import("../tools/gpu-compute.js");
    const result = await gpuListTool.execute({ minVramGb: 48 }, {} as any);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("A100 80GB");
    expect(result.content).toContain("L40S");
    expect(result.content).not.toContain("4090"); // 24GB
  });

  it("returns sorted cheapest-first", async () => {
    const { gpuListTool } = await import("../tools/gpu-compute.js");
    const result = await gpuListTool.execute({}, {} as any);
    const lines = result.content.split("\n").filter(l => l.includes("GB VRAM"));
    const costs = lines.map(l => parseFloat(l.match(/\$(\d+\.\d+)/)?.[1] ?? "999"));
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeGreaterThanOrEqual(costs[i - 1]);
    }
  });
});

// Skipping API-calling tests — they require live RunPod API key.
// Tests above verify the GPU listing logic works.
// Run manually with: RUNPOD_API_KEY=sk-... npx vitest run src/__tests__/gpu.test.ts
