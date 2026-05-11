/**
 * gpu/runpod.ts — RunPod GPU compute adapter
 *
 * RunPod API docs: https://docs.runpod.io/api-reference
 * Pricing: A100 80GB $0.49/hr, A100 40GB $0.39/hr, 4090 $0.29/hr
 *
 * Uses the RunPod serverless GPU endpoints API.
 */

import type { GPUProvider, GPUType, GPUProvisionConfig, GPUInstance } from "./providers.js";

const RUNPOD_API = "https://api.runpod.io/v2";

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const key = process.env.RUNPOD_API_KEY;
  if (!key) throw new Error("RUNPOD_API_KEY not set. Get one at https://runpod.io");
  const res = await fetch(`${RUNPOD_API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(options.headers as Record<string, string>),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`RunPod ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

const GPU_MAP: Record<string, { name: string; vramGb: number }> = {
  "NVIDIA A100 80GB SXM": { name: "NVIDIA A100 80GB", vramGb: 80 },
  "NVIDIA A100 40GB PCIe": { name: "NVIDIA A100 40GB", vramGb: 40 },
  "NVIDIA A100 80GB PCIe": { name: "NVIDIA A100 80GB", vramGb: 80 },
  "NVIDIA RTX 6000 Ada": { name: "NVIDIA RTX 6000 Ada", vramGb: 48 },
  "NVIDIA RTX 4090": { name: "NVIDIA RTX 4090", vramGb: 24 },
  "NVIDIA RTX 3090": { name: "NVIDIA RTX 3090", vramGb: 24 },
  "NVIDIA L40S": { name: "NVIDIA L40S", vramGb: 48 },
  "NVIDIA H100 80GB HBM3": { name: "NVIDIA H100 80GB", vramGb: 80 },
};

function _parseGpuType(rawId: string): GPUType {
  const mapped = GPU_MAP[rawId] || { name: rawId, vramGb: 0 };
  return {
    id: rawId,
    name: mapped.name,
    vramGb: mapped.vramGb,
    costPerHr: 0, // filled by API response
    provider: "runpod",
    available: true,
  };
}

export class RunPodProvider implements GPUProvider {
  readonly name = "runpod";

  async listGPUTypes(): Promise<GPUType[]> {
    // RunPod doesn't have a GPU type listing endpoint.
    // Return known types with current pricing.
    const gpus: GPUType[] = [
      { id: "NVIDIA A100 80GB SXM", name: "NVIDIA A100 80GB", vramGb: 80, costPerHr: 0.49, provider: "runpod", available: true },
      { id: "NVIDIA A100 40GB PCIe", name: "NVIDIA A100 40GB", vramGb: 40, costPerHr: 0.39, provider: "runpod", available: true },
      { id: "NVIDIA RTX 4090", name: "NVIDIA RTX 4090", vramGb: 24, costPerHr: 0.29, provider: "runpod", available: true },
      { id: "NVIDIA RTX 3090", name: "NVIDIA RTX 3090", vramGb: 24, costPerHr: 0.19, provider: "runpod", available: false },
      { id: "NVIDIA H100 80GB HBM3", name: "NVIDIA H100 80GB", vramGb: 80, costPerHr: 1.49, provider: "runpod", available: true },
      { id: "NVIDIA L40S", name: "NVIDIA L40S", vramGb: 48, costPerHr: 0.59, provider: "runpod", available: true },
    ];
    return gpus;
  }

  async provision(config: GPUProvisionConfig): Promise<GPUInstance> {
    // Deploy a GPU pod
    const gpuId = Object.keys(GPU_MAP).find(k => k.includes(config.gpuType) || GPU_MAP[k].name === config.gpuType) || config.gpuType;
    const price = (await this.listGPUTypes()).find(g => g.id === gpuId || g.name === config.gpuType);
    const costPerHr = price?.costPerHr ?? 0.49;

    const body: Record<string, unknown> = {
      gpuTypeId: gpuId,
      containerDiskSizeGb: config.containerDiskGb,
      volumeSizeGb: config.volumeDiskGb ?? 0,
      templateId: "docker-template",
      imageName: config.imageName || "nvidia/cuda:12.4.0-base",
      startSsh: config.startSsh,
      startJupyter: config.startJupyter ?? false,
      env: config.env,
    };

    const data = await apiFetch("/gpus/deploy", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const instanceId = data.id || data.instanceId || "unknown";
    return {
      id: instanceId,
      provider: "runpod",
      gpuType: gpuId,
      status: "provisioning",
      costPerHr,
      totalCost: 0,
      startedAt: new Date().toISOString(),
      sshCommand: `ssh -p 22 root@${data.ipAddress || "<ip>"}`,
    };
  }

  async getStatus(instanceId: string): Promise<GPUInstance> {
    const data = await apiFetch(`/gpus/status?ids=${instanceId}`);
    const pod = Array.isArray(data) ? data[0] : data;
    const costPerHr = pod.gpuCostPerHr ?? 0.49;
    const elapsedHrs = pod.elapsedSeconds ? pod.elapsedSeconds / 3600 : 0;
    return {
      id: instanceId,
      provider: "runpod",
      gpuType: pod.gpuTypeId || "unknown",
      status: mapStatus(pod.desiredStatus || pod.status),
      costPerHr,
      totalCost: costPerHr * elapsedHrs,
      startedAt: pod.createdAt || new Date().toISOString(),
      ipAddress: pod.ipAddress,
      sshCommand: pod.ipAddress ? `ssh -p 22 root@${pod.ipAddress}` : undefined,
    };
  }

  async getLogs(instanceId: string): Promise<string> {
    try {
      const data = await apiFetch(`/gpus/logs?ids=${instanceId}`);
      return Array.isArray(data) ? data.map((l: any) => l.line || "").join("\n") : "No logs available.";
    } catch {
      return "Logs not available (instance may be starting).";
    }
  }

  async destroy(instanceId: string): Promise<void> {
    await apiFetch(`/gpus/stop?ids=${instanceId}`, { method: "POST" });
  }

  async estimateCost(gpuType: string, hours: number): Promise<number> {
    const gpus = await this.listGPUTypes();
    const gpu = gpus.find(g => g.id.includes(gpuType) || g.name === gpuType);
    return (gpu?.costPerHr ?? 0.49) * hours;
  }
}

function mapStatus(status: string): GPUInstance["status"] {
  switch (status?.toLowerCase()) {
    case "running": return "running";
    case "starting":
    case "provisioning": return "provisioning";
    case "stopped":
    case "stopping": return "stopped";
    case "failed":
    case "error": return "failed";
    case "terminated":
    case "destroyed": return "destroyed";
    default: return "running";
  }
}
