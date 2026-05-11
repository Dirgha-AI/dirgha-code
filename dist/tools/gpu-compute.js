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
import { RunPodProvider } from "../gpu/runpod.js";
let _providers = null;
function getProviders() {
    if (!_providers) {
        _providers = [new RunPodProvider()];
    }
    return _providers;
}
async function listAllGPUTypes() {
    const results = await Promise.all(getProviders().map(async (p) => {
        try {
            const types = await p.listGPUTypes();
            return types.filter((t) => t.available);
        }
        catch {
            return [];
        }
    }));
    return results.flat().sort((a, b) => a.costPerHr - b.costPerHr);
}
function findCheapest(gpus, minVramGb, preferProvider) {
    let filtered = gpus;
    if (minVramGb)
        filtered = filtered.filter((g) => g.vramGb >= minVramGb);
    if (preferProvider) {
        const preferred = filtered.filter((g) => g.provider === preferProvider);
        if (preferred.length > 0)
            return preferred[0];
    }
    return filtered[0] ?? null;
}
export const gpuListTool = {
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
    async execute(rawInput, _ctx) {
        const input = rawInput;
        const all = await listAllGPUTypes();
        let filtered = all;
        if (input.minVramGb)
            filtered = filtered.filter((g) => g.vramGb >= input.minVramGb);
        if (input.provider)
            filtered = filtered.filter((g) => g.provider === input.provider);
        if (filtered.length === 0)
            return { isError: false, content: "No GPUs available matching your criteria." };
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
export const gpuComputeTool = {
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
    async execute(rawInput, _ctx) {
        const input = rawInput;
        const provider = new RunPodProvider();
        // Pick GPU
        const allTypes = await provider.listGPUTypes();
        let chosenGPU = null;
        if (input.gpuType) {
            chosenGPU = allTypes.find((g) => g.name.includes(input.gpuType) || g.id.includes(input.gpuType)) ?? null;
        }
        else if (input.minVramGb) {
            chosenGPU = allTypes.filter((g) => g.vramGb >= input.minVramGb)[0] ?? null;
        }
        else {
            chosenGPU = allTypes[0] ?? null;
        }
        if (!chosenGPU)
            return { isError: true, content: "No suitable GPU available." };
        // Provision
        const instance = await provider.provision({
            gpuType: chosenGPU.id,
            imageName: input.imageName ?? "nvidia/cuda:12.4.0-base",
            containerDiskGb: input.containerDiskGb ?? 20,
            env: input.env,
            startSsh: true,
        });
        const autoDestroy = input.autoDestroy !== false;
        let result = `✅ GPU instance provisioned on ${provider.name}:
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
export const gpuStatusTool = {
    name: "gpu_status",
    description: "Check the status of a running GPU instance.",
    inputSchema: {
        type: "object",
        properties: {
            instanceId: { type: "string", description: "Instance ID from gpu_compute." },
        },
        required: ["instanceId"],
    },
    async execute(rawInput, _ctx) {
        const input = rawInput;
        const provider = new RunPodProvider();
        try {
            const status = await provider.getStatus(input.instanceId);
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
        }
        catch (err) {
            return { isError: true, content: `Failed to get status: ${err.message}` };
        }
    },
};
export const gpuDestroyTool = {
    name: "gpu_destroy",
    description: "Destroy a GPU instance to stop billing.",
    inputSchema: {
        type: "object",
        properties: {
            instanceId: { type: "string", description: "Instance ID to destroy." },
        },
        required: ["instanceId"],
    },
    async execute(rawInput, _ctx) {
        const input = rawInput;
        const provider = new RunPodProvider();
        try {
            const status = await provider.getStatus(input.instanceId);
            const totalCost = status.totalCost;
            await provider.destroy(input.instanceId);
            return {
                isError: false,
                content: `✅ GPU instance ${input.instanceId.slice(0, 12)} destroyed.
  Total cost: $${totalCost.toFixed(4)}
  Instance terminated. No further billing.`,
            };
        }
        catch (err) {
            return { isError: true, content: `Failed to destroy: ${err.message}` };
        }
    },
};
//# sourceMappingURL=gpu-compute.js.map