/**
 * gpu/akash.ts — Akash Network GPU compute adapter
 *
 * Akash Network: decentralized cloud marketplace.
 * Cheapest GPU option for many workloads.
 * Uses the Akash provider-services CLI or direct API.
 */
const AKASH_API = "https://api.akashnet.net/v1";
async function apiFetch(path, options = {}) {
    const key = process.env.AKASH_API_KEY;
    // Akash can work without an API key for GPU listings (public data)
    const res = await fetch(`${AKASH_API}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
            ...options.headers,
        },
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
        const err = await res.text().catch(() => "unknown");
        throw new Error(`Akash ${res.status}: ${err.slice(0, 200)}`);
    }
    return res.json();
}
export class AkashProvider {
    name = "akash";
    async listGPUTypes() {
        return [
            { id: "NVIDIA A100 80GB", name: "NVIDIA A100 80GB", vramGb: 80, costPerHr: 0.28, provider: "akash", available: true },
            { id: "NVIDIA A100 40GB", name: "NVIDIA A100 40GB", vramGb: 40, costPerHr: 0.22, provider: "akash", available: true },
            { id: "NVIDIA RTX 4090", name: "NVIDIA RTX 4090", vramGb: 24, costPerHr: 0.18, provider: "akash", available: true },
            { id: "NVIDIA RTX 3090", name: "NVIDIA RTX 3090", vramGb: 24, costPerHr: 0.12, provider: "akash", available: true },
            { id: "NVIDIA RTX 3080", name: "NVIDIA RTX 3080", vramGb: 10, costPerHr: 0.08, provider: "akash", available: true },
            { id: "NVIDIA A10", name: "NVIDIA A10", vramGb: 24, costPerHr: 0.15, provider: "akash", available: true },
        ];
    }
    async provision(config) {
        if (!process.env.AKASH_API_KEY) {
            throw new Error("AKASH_API_KEY not set. Get one at https://akash.network");
        }
        const price = (await this.listGPUTypes()).find(g => g.name === config.gpuType || g.id === config.gpuType);
        const costPerHr = price?.costPerHr ?? 0.22;
        const body = {
            gpuType: config.gpuType,
            image: config.imageName || "nvidia/cuda:12.4.0-base",
            cpu: 4,
            memory: "16Gi",
            storage: `${config.containerDiskGb || 20}Gi`,
            env: config.env,
            sshKey: config.startSsh,
        };
        const data = await apiFetch("/deploy", {
            method: "POST",
            body: JSON.stringify(body),
        });
        return {
            id: data.id || data.deploymentId || "unknown",
            provider: "akash",
            gpuType: config.gpuType,
            status: "provisioning",
            costPerHr,
            totalCost: 0,
            startedAt: new Date().toISOString(),
            sshCommand: data.sshCommand,
        };
    }
    async getStatus(instanceId) {
        const data = await apiFetch(`/deployments/${instanceId}`);
        return {
            id: instanceId,
            provider: "akash",
            gpuType: data.gpuType || "unknown",
            status: data.status === "active" ? "running" : "provisioning",
            costPerHr: data.costPerHr ?? 0.22,
            totalCost: data.totalCost ?? 0,
            startedAt: data.createdAt || new Date().toISOString(),
            ipAddress: data.ipAddress,
        };
    }
    async getLogs(_instanceId) {
        return "Logs: Akash streaming logs not yet implemented.";
    }
    async destroy(instanceId) {
        if (!process.env.AKASH_API_KEY)
            throw new Error("AKASH_API_KEY not set");
        await apiFetch(`/deployments/${instanceId}`, { method: "DELETE" });
    }
    async estimateCost(gpuType, hours) {
        const gpus = await this.listGPUTypes();
        const gpu = gpus.find(g => g.id === gpuType || g.name === gpuType);
        return (gpu?.costPerHr ?? 0.22) * hours;
    }
}
//# sourceMappingURL=akash.js.map