/**
 * gpu/vast.ts — Vast.ai GPU compute adapter
 *
 * Vast.ai is the cheapest GPU marketplace. Interruptible instances
 * are 50%+ cheaper than on-demand with per-second billing.
 * Prices change based on supply/demand.
 */

import type { GPUProvider, GPUType, GPUProvisionConfig, GPUInstance } from "./providers.js";

const VAST_API = "https://api.vast.ai/v1";

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const key = process.env.VAST_API_KEY;
  if (!key) throw new Error("VAST_API_KEY not set. Get one at https://vast.ai");
  const res = await fetch(`${VAST_API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers as Record<string, string>) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`Vast ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

export class VastProvider implements GPUProvider {
  readonly name = "vast";

  async listGPUTypes(): Promise<GPUType[]> {
    // Vast.ai prices fluctuate. These are approximate on-demand rates.
    // Interruptible (preemptible) is ~50% cheaper.
    return [
      { id: "NVIDIA A100 80GB", name: "NVIDIA A100 80GB", vramGb: 80, costPerHr: 0.45, provider: "vast", available: true },
      { id: "NVIDIA A100 40GB", name: "NVIDIA A100 40GB", vramGb: 40, costPerHr: 0.35, provider: "vast", available: true },
      { id: "NVIDIA RTX 4090", name: "NVIDIA RTX 4090", vramGb: 24, costPerHr: 0.18, provider: "vast", available: true },
      { id: "NVIDIA RTX 3090", name: "NVIDIA RTX 3090", vramGb: 24, costPerHr: 0.12, provider: "vast", available: true },
      { id: "NVIDIA RTX 4070", name: "NVIDIA RTX 4070", vramGb: 12, costPerHr: 0.09, provider: "vast", available: true },
      { id: "NVIDIA H100 80GB", name: "NVIDIA H100 80GB", vramGb: 80, costPerHr: 1.20, provider: "vast", available: true },
    ];
  }

  async provision(config: GPUProvisionConfig): Promise<GPUInstance> {
    if (!process.env.VAST_API_KEY) throw new Error("VAST_API_KEY not set");
    const price = (await this.listGPUTypes()).find(g => g.name === config.gpuType);
    const data = await apiFetch("/instances", {
      method: "POST",
      body: JSON.stringify({
        gpuType: config.gpuType,
        image: config.imageName || "nvidia/cuda:12.4.0-base",
        disk: config.containerDiskGb || 20,
        env: config.env,
        ssh: config.startSsh,
      }),
    });
    return {
      id: data.id || data.instanceId || "unknown",
      provider: "vast",
      gpuType: config.gpuType,
      status: "provisioning",
      costPerHr: price?.costPerHr ?? 0.45,
      totalCost: 0,
      startedAt: new Date().toISOString(),
      sshCommand: data.sshCommand ? `ssh ${data.sshCommand}` : undefined,
    };
  }

  async getStatus(instanceId: string): Promise<GPUInstance> {
    const data = await apiFetch(`/instances/${instanceId}`);
    return {
      id: instanceId,
      provider: "vast",
      gpuType: data.gpuType || "unknown",
      status: data.status === "running" ? "running" : "provisioning",
      costPerHr: data.costPerHr ?? 0.45,
      totalCost: data.totalCost ?? 0,
      startedAt: data.startDate || new Date().toISOString(),
      ipAddress: data.ipAddress,
    };
  }

  async getLogs(_instanceId: string): Promise<string> {
    return "Vast.ai logs available via web dashboard.";
  }

  async destroy(instanceId: string): Promise<void> {
    await apiFetch(`/instances/${instanceId}`, { method: "DELETE" });
  }

  async estimateCost(gpuType: string, hours: number): Promise<number> {
    const gpus = await this.listGPUTypes();
    const gpu = gpus.find(g => g.id === gpuType || g.name === gpuType);
    return (gpu?.costPerHr ?? 0.45) * hours;
  }
}
