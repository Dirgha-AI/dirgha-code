/**
 * gpu/spheron.ts — Spheron GPU compute adapter
 *
 * Spheron Network: decentralized GPU compute marketplace.
 * Cheaper than RunPod for some GPU types.
 * API: https://docs.spheron.network/api
 */
const SPHERON_API = "https://api.spheron.network/v1";
async function apiFetch(path, options = {}) {
    const key = process.env.SPHERON_API_KEY;
    if (!key)
        throw new Error("SPHERON_API_KEY not set. Get one at https://spheron.network");
    const res = await fetch(`${SPHERON_API}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            ...options.headers,
        },
        signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
        const err = await res.text().catch(() => "unknown");
        throw new Error(`Spheron ${res.status}: ${err.slice(0, 200)}`);
    }
    return res.json();
}
export class SpheronProvider {
    name = "spheron";
    async listGPUTypes() {
        return [
            { id: "NVIDIA A100 80GB", name: "NVIDIA A100 80GB", vramGb: 80, costPerHr: 0.35, provider: "spheron", available: true },
            { id: "NVIDIA A100 40GB", name: "NVIDIA A100 40GB", vramGb: 40, costPerHr: 0.28, provider: "spheron", available: true },
            { id: "NVIDIA RTX 4090", name: "NVIDIA RTX 4090", vramGb: 24, costPerHr: 0.22, provider: "spheron", available: true },
            { id: "NVIDIA RTX 3090", name: "NVIDIA RTX 3090", vramGb: 24, costPerHr: 0.15, provider: "spheron", available: true },
            { id: "NVIDIA RTX 4070", name: "NVIDIA RTX 4070", vramGb: 12, costPerHr: 0.12, provider: "spheron", available: true },
        ];
    }
    async provision(config) {
        const price = (await this.listGPUTypes()).find(g => g.name === config.gpuType || g.id === config.gpuType);
        const costPerHr = price?.costPerHr ?? 0.28;
        const body = {
            gpuType: config.gpuType,
            image: config.imageName || "nvidia/cuda:12.4.0-base",
            diskSize: config.containerDiskGb || 20,
            env: config.env,
            sshEnabled: config.startSsh,
        };
        const data = await apiFetch("/deployments", {
            method: "POST",
            body: JSON.stringify(body),
        });
        return {
            id: data.id || data.deploymentId || "unknown",
            provider: "spheron",
            gpuType: config.gpuType,
            status: "provisioning",
            costPerHr,
            totalCost: 0,
            startedAt: new Date().toISOString(),
            sshCommand: data.sshCommand ? `ssh ${data.sshCommand}` : undefined,
        };
    }
    async getStatus(instanceId) {
        const data = await apiFetch(`/deployments/${instanceId}`);
        return {
            id: instanceId,
            provider: "spheron",
            gpuType: data.gpuType || "unknown",
            status: data.status === "active" ? "running" : "provisioning",
            costPerHr: data.costPerHr ?? 0.28,
            totalCost: data.totalCost ?? 0,
            startedAt: data.createdAt || new Date().toISOString(),
            ipAddress: data.ipAddress,
        };
    }
    async getLogs(_instanceId) {
        return "Logs: Spheron streaming logs not yet implemented.";
    }
    async destroy(instanceId) {
        await apiFetch(`/deployments/${instanceId}`, { method: "DELETE" });
    }
    async estimateCost(gpuType, hours) {
        const gpus = await this.listGPUTypes();
        const gpu = gpus.find(g => g.id === gpuType || g.name === gpuType);
        return (gpu?.costPerHr ?? 0.28) * hours;
    }
}
//# sourceMappingURL=spheron.js.map