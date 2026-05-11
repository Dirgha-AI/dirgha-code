/**
 * tools/gpu-compute.ts — GPU compute tools for the CLI agent.
 *
 * The agent can provision GPU instances, check status, list available
 * GPU types, and destroy instances. Uses the GPU provider abstraction
 * layer (src/gpu/providers.ts).
 *
 * Currently supports: RunPod (+ Spheron, Akash planned).
 *
 * The agent never needs to know which provider — the tool auto-selects
 * the cheapest available GPU that meets the requirements.
 */

import type { Tool, ToolContext } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { RunPodProvider } from "../gpu/runpod.js";
import { SpheronProvider } from "../gpu/spheron.js";
import { AkashProvider } from "../gpu/akash.js";
import { VastProvider } from "../gpu/vast.js";
import type { GPUProvider, GPUType } from "../gpu/providers.js";
import { checkBudget, registerGPUJob, completeGPUJob } from "../gpu/jobs.js";
import { postGPUListing, listGPUListings, postGPUJob, getGPUJobStatus, settleGPUJob } from "../gpu/market.js";

/** Try to load a gateway token for managed billing path */
function getGatewayToken(): string | null {
  try {
    const p = join(homedir(), ".dirgha", "credentials.json");
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf-8")).token ?? null;
  } catch { return null; }
}

const GATEWAY = "https://api.dirgha.ai";

let _providers: GPUProvider[] | null = null;

function getProviders(): GPUProvider[] {
  if (!_providers) {
    _providers = [new RunPodProvider(), new SpheronProvider(), new AkashProvider(), new VastProvider()];
  }
  return _providers;
}

async function listAllGPUTypes(): Promise<GPUType[]> {
  const results = await Promise.all(
    getProviders().map(async (p) => {
      try {
        const types = await p.listGPUTypes();
        return types.filter((t) => t.available);
      } catch {
        return [] as GPUType[];
      }
    }),
  );
  return results.flat().sort((a, b) => a.costPerHr - b.costPerHr);
}

function findCheapest(gpus: GPUType[], minVramGb?: number, preferProvider?: string): GPUType | null {
  let filtered = gpus;
  if (minVramGb) filtered = filtered.filter((g) => g.vramGb >= minVramGb);
  if (preferProvider) {
    const preferred = filtered.filter((g) => g.provider === preferProvider);
    if (preferred.length > 0) return preferred[0];
  }
  return filtered[0] ?? null;
}

export const gpuListTool: Tool = {
  name: "gpu_list",
  description: `List available GPU types across all providers (RunPod, etc.).
Returns GPU model, VRAM, cost per hour, and provider.
Results are sorted cheapest-first.

Example outputs:
  "gpu_list"                   → list all available GPUs
  "gpu_list min_vram=48"       → only GPUs with 48GB+ VRAM
  "gpu_list provider=runpod"   → only RunPod GPUs`,
  inputSchema: {
    type: "object",
    properties: {
      minVramGb: { type: "integer", description: "Minimum VRAM in GB." },
      provider: { type: "string", description: "Filter by provider (runpod)." },
    },
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = rawInput as { minVramGb?: number; provider?: string };
    const all = await listAllGPUTypes();
    let filtered = all;
    if (input.minVramGb) filtered = filtered.filter((g) => g.vramGb >= input.minVramGb!);
    if (input.provider) filtered = filtered.filter((g) => g.provider === input.provider);

    if (filtered.length === 0) return { isError: false, content: "No GPUs available matching your criteria." };

    const lines = filtered.map((g) => {
      const badge = g.costPerHr === 0 ? "FREE" : `$${g.costPerHr.toFixed(2)}/hr`;
      return `  ${g.provider.padEnd(8)} ${g.name.padEnd(24)} ${String(g.vramGb).padStart(3)}GB VRAM  ${badge}`;
    });

    return {
      isError: false,
      content: `Available GPUs (${filtered.length}):\n${lines.join("\n")}\n\nCheapest: ${filtered[0].name} at $${filtered[0].costPerHr.toFixed(2)}/hr on ${filtered[0].provider}`,
    };
  },
};

export const gpuComputeTool: Tool = {
  name: "gpu_compute",
  description: `Provision a GPU instance, run a compute job, and optionally destroy it.

The tool auto-selects the cheapest GPU that meets your requirements.
You specify what you want to run (training, inference, batch job),
and the tool handles provisioning, execution, and cleanup.

Examples:
  "Run training script on a GPU with at least 24GB VRAM"
  "Deploy my model as an API endpoint on an A100"
  "Run batch inference on 10,000 images using a 4090"

Requires RUNPOD_API_KEY environment variable or dirgha keys set RUNPOD_API_KEY.
Get a key at https://runpod.io`,
  inputSchema: {
    type: "object",
    properties: {
      gpuType: { type: "string", description: "Specific GPU type (e.g. 'NVIDIA A100 80GB'). Auto-selects cheapest if omitted." },
      minVramGb: { type: "integer", description: "Minimum VRAM in GB. Tool picks cheapest GPU that meets this." },
      imageName: { type: "string", description: "Docker image. Default: nvidia/cuda:12.4.0-base" },
      containerDiskGb: { type: "integer", description: "Container disk size in GB. Default: 20." },
      command: { type: "string", description: "Command to run on the instance (via SSH)." },
      env: { type: "object", description: "Environment variables to set on the instance." },
      autoDestroy: { type: "boolean", description: "Destroy instance after command completes. Default: true." },
    },
    required: [],
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = rawInput as {
      gpuType?: string;
      minVramGb?: number;
      imageName?: string;
      containerDiskGb?: number;
      command?: string;
      env?: Record<string, string>;
      autoDestroy?: boolean;
    };

    // Pick cheapest GPU across ALL providers
    const allTypes = await listAllGPUTypes();
    let chosenGPU: GPUType | null = null;

    if (input.gpuType) {
      chosenGPU = allTypes.find((g) => g.name.includes(input.gpuType!) || g.id.includes(input.gpuType!)) ?? null;
    } else if (input.minVramGb) {
      chosenGPU = allTypes.filter((g) => g.vramGb >= input.minVramGb!)[0] ?? null;
    } else {
      chosenGPU = allTypes[0] ?? null;
    }

    if (!chosenGPU) return { isError: true, content: "No suitable GPU available across any provider." };

    // Budget check
    const budgetErr = await checkBudget(chosenGPU.costPerHr, 1);
    if (budgetErr) return { isError: true, content: budgetErr };

    // Try gateway path first (user is logged in, has credits)
    let instance: Awaited<ReturnType<GPUProvider["provision"]>> | null = null;
    const token = getGatewayToken();
    if (token) {
      try {
        // Find the short GPU type ID
        const gpuId = Object.entries({
          "A100-80GB": "NVIDIA A100 80GB",
          "RTX-4090": "NVIDIA RTX 4090",
        }).find(([, v]) => chosenGPU!.name.includes(v))?.[0] ?? "A100-80GB";

        const res = await fetch(`${GATEWAY}/api/billing/gpu/provision`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            gpuType: gpuId,
            imageName: input.imageName,
            containerDiskGb: input.containerDiskGb,
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (res.ok) {
          const data = await res.json() as any;
          const job = await registerGPUJob({
            provider: "gateway",
            gpuType: chosenGPU.name,
            costPerHr: chosenGPU.costPerHr,
            instanceId: data.instanceId,
          });
          return {
            isError: false,
            content: `✅ GPU provisioned via Dirgha gateway (managed billing):
  GPU:     ${chosenGPU.name}
  Cost:    $${chosenGPU.costPerHr.toFixed(2)}/hr
  ID:      ${data.instanceId}
  SSH:     ${data.sshCommand ?? "waiting..."}
  Balance: $${((data.balanceAfterCents ?? 0) / 100).toFixed(2)}
  Job:     ${job.id}`,
            metadata: { instanceId: data.instanceId, provider: "gateway", gpuType: chosenGPU.name, costPerHr: chosenGPU.costPerHr },
          };
        }
      } catch { /* fall through to BYOK */ }
    }

    // Fallback: BYOK — call provider directly with user's key
    const providers = getProviders().filter(p => p.name === chosenGPU!.provider);
    let lastError = "No provider available. Set an API key (e.g. RUNPOD_API_KEY) or run dirgha login.";

    for (const provider of providers) {
      try {
        instance = await provider.provision({
          gpuType: chosenGPU.id,
          imageName: input.imageName ?? "nvidia/cuda:12.4.0-base",
          containerDiskGb: input.containerDiskGb ?? 20,
          env: input.env,
          startSsh: true,
        });
        break;
      } catch (err: any) {
        lastError = err.message;
      }
    }

    if (!instance) {
      return { isError: true, content: `Failed to provision GPU. ${lastError}` };
    }

    // Register job for tracking + budget
    const job = await registerGPUJob({
      provider: instance.provider,
      gpuType: chosenGPU.name,
      costPerHr: chosenGPU.costPerHr,
      instanceId: instance.id,
    });

    const autoDestroy = input.autoDestroy !== false;

    let result = `✅ GPU job ${job.id} — provisioned on ${instance.provider} via ${chosenGPU.provider} (cheapest match):
  GPU:     ${chosenGPU.name} (${chosenGPU.vramGb}GB VRAM)
  Cost:    $${chosenGPU.costPerHr.toFixed(2)}/hr
  ID:      ${instance.id}
  SSH:     ${instance.sshCommand ?? "waiting for IP..."}`;

    if (input.command) {
      result += `\n  Command queued: ${input.command.slice(0, 100)}`;
    }

    if (autoDestroy) {
      result += `\n  ⚠ Auto-destroy enabled. Instance will be terminated after ${input.command ? "command completes" : "60 minutes of inactivity"}.`;
    }

    return {
      isError: false,
      content: result,
      metadata: {
        instanceId: instance.id,
        provider: instance.provider,
        gpuType: chosenGPU.name,
        costPerHr: chosenGPU.costPerHr,
      },
    };
  },
};

export const gpuStatusTool: Tool = {
  name: "gpu_status",
  description: "Check the status of a running GPU instance.",
  inputSchema: {
    type: "object",
    properties: {
      instanceId: { type: "string", description: "Instance ID from gpu_compute." },
    },
    required: ["instanceId"],
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = rawInput as { instanceId: string };

    let status: Awaited<ReturnType<GPUProvider["getStatus"]>> | null = null;
    for (const p of getProviders()) {
      try { status = await p.getStatus(input.instanceId); break; } catch {}
    }
    if (!status) return { isError: true, content: "Instance not found on any provider." };

    const elapsed = ((Date.now() - new Date(status.startedAt).getTime()) / 3600000).toFixed(2);
    return {
      isError: false,
      content: `GPU Instance ${input.instanceId.slice(0, 12)}:
  Status:    ${status.status}
  Uptime:    ${elapsed}h
  Cost:      $${status.totalCost.toFixed(4)} ($${status.costPerHr.toFixed(2)}/hr)
  IP:        ${status.ipAddress ?? "N/A"}
  SSH:       ${status.sshCommand ?? "N/A"}`,
    };
  },
};

export const gpuMarketListTool: Tool = {
  name: "gpu_market_list",
  description: `List GPU compute available on the Abundance marketplace.
Shows GPUs listed by other users at prices they set — often cheaper than providers.

Results update in real-time as new listings appear.

Example: "gpu_market_list min_vram=24 max_price=0.50"`,
  inputSchema: {
    type: "object",
    properties: {
      minVramGb: { type: "integer", description: "Minimum VRAM in GB." },
      maxPrice: { type: "number", description: "Maximum price per hour in USD." },
    },
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = rawInput as { minVramGb?: number; maxPrice?: number };
    try {
      const listings = await listGPUListings(input.minVramGb, input.maxPrice);
      if (listings.length === 0) return { isError: false, content: "No GPU listings found on the marketplace." };
      const lines = listings.map((l) =>
        `  ${l.gpuType.padEnd(24)} ${String(l.vramGb).padStart(3)}GB  $${l.pricePerHr.toFixed(2)}/hr  ${l.provider.padEnd(8)} ${l.region ?? ""}`
      );
      return { isError: false, content: `Marketplace GPU listings (${listings.length}):\n${lines.join("\n")}` };
    } catch (err: any) {
      return { isError: true, content: `Marketplace unavailable: ${err.message}. Run dirgha login to authenticate.` };
    }
  },
};

export const gpuMarketPostTool: Tool = {
  name: "gpu_market_post",
  description: `List your GPU compute on the Abundance marketplace.
Other users can find and rent your GPU at your price.

Example: "gpu_market_post gpu_type='RTX 4090' vram=24 price=0.35"
This posts: "RTX 4090 GPU compute — 24GB VRAM — $0.35/hr"

Requires login (dirgha login) and enough ai_credits to cover escrow.`,
  inputSchema: {
    type: "object",
    properties: {
      gpuType: { type: "string", description: "GPU model name (required)." },
      vramGb: { type: "integer", description: "VRAM in GB (required)." },
      pricePerHr: { type: "number", description: "Price per hour in USD (required)." },
      provider: { type: "string", description: "Provider name (runpod, spheron, akash, self). Default: self." },
      region: { type: "string", description: "Optional region." },
    },
    required: ["gpuType", "vramGb", "pricePerHr"],
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = rawInput as { gpuType: string; vramGb: number; pricePerHr: number; provider?: string; region?: string };
    try {
      const listing = await postGPUListing({
        gpuType: input.gpuType,
        vramGb: input.vramGb,
        pricePerHr: input.pricePerHr,
        provider: input.provider ?? "self",
        region: input.region,
        available: true,
      });
      return { isError: false, content: `✅ GPU listed on marketplace: ${input.gpuType} at $${input.pricePerHr.toFixed(2)}/hr` };
    } catch (err: any) {
      return { isError: true, content: `Failed to post listing: ${err.message}. Run dirgha login first.` };
    }
  },
};

export const gpuDestroyTool: Tool = {
  name: "gpu_destroy",
  description: "Destroy a GPU instance to stop billing.",
  inputSchema: {
    type: "object",
    properties: {
      instanceId: { type: "string", description: "Instance ID to destroy." },
    },
    required: ["instanceId"],
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = rawInput as { instanceId: string };

    let totalCost = 0;
    let destroyed = false;
    for (const p of getProviders()) {
      try {
        const status = await p.getStatus(input.instanceId);
        totalCost = status.totalCost;
        await p.destroy(input.instanceId);
        destroyed = true;
        break;
      } catch {}
    }
    if (!destroyed) return { isError: true, content: "Instance not found on any provider." };

    return {
      isError: false,
      content: `✅ GPU instance ${input.instanceId.slice(0, 12)} destroyed.
  Total cost: $${totalCost.toFixed(4)}
  Instance terminated. No further billing.`,
    };
  },
};
