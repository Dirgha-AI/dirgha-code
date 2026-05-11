/**
 * gpu/providers.ts — GPU compute provider interface
 *
 * Abstraction layer for provisioning GPU instances across different
 * providers (RunPod, Spheron, Akash, etc.). Each provider implements
 * this interface. The gpu_compute tool auto-selects the cheapest.
 */

export interface GPUType {
  id: string;
  name: string;          // e.g. "NVIDIA A100 80GB"
  vramGb: number;
  costPerHr: number;     // USD
  provider: string;      // e.g. "runpod"
  region?: string;
  available: boolean;
}

export interface GPUProvisionConfig {
  gpuType: string;
  imageName: string;     // Docker image (e.g. "nvidia/cuda:12.4.0-base")
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
  totalCost: number;      // Accumulated cost in USD
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
