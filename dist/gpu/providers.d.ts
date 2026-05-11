/**
 * gpu/providers.ts — GPU compute provider interface
 *
 * Abstraction layer for provisioning GPU instances across different
 * providers (RunPod, Spheron, Akash, etc.). Each provider implements
 * this interface. The gpu_compute tool auto-selects the cheapest.
 */
export interface GPUType {
    id: string;
    name: string;
    vramGb: number;
    costPerHr: number;
    provider: string;
    region?: string;
    available: boolean;
}
export interface GPUProvisionConfig {
    gpuType: string;
    imageName: string;
    containerDiskGb: number;
    volumeDiskGb?: number;
    env?: Record<string, string>;
    startSsh: boolean;
    startJupyter?: boolean;
}
export interface GPUInstance {
    id: string;
    provider: string;
    gpuType: string;
    status: "provisioning" | "running" | "stopped" | "failed" | "destroyed";
    costPerHr: number;
    totalCost: number;
    startedAt: string;
    ipAddress?: string;
    sshCommand?: string;
    logs?: string;
}
export interface GPUProvider {
    readonly name: string;
    listGPUTypes(): Promise<GPUType[]>;
    provision(config: GPUProvisionConfig): Promise<GPUInstance>;
    getStatus(instanceId: string): Promise<GPUInstance>;
    getLogs(instanceId: string): Promise<string>;
    destroy(instanceId: string): Promise<void>;
    estimateCost(gpuType: string, hours: number): Promise<number>;
}
