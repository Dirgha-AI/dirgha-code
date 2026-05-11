/**
 * gpu/spheron.ts — Spheron GPU compute adapter
 *
 * Spheron Network: decentralized GPU compute marketplace.
 * Cheaper than RunPod for some GPU types.
 * API: https://docs.spheron.network/api
 */
import type { GPUProvider, GPUType, GPUProvisionConfig, GPUInstance } from "./providers.js";
export declare class SpheronProvider implements GPUProvider {
    readonly name = "spheron";
    listGPUTypes(): Promise<GPUType[]>;
    provision(config: GPUProvisionConfig): Promise<GPUInstance>;
    getStatus(instanceId: string): Promise<GPUInstance>;
    getLogs(_instanceId: string): Promise<string>;
    destroy(instanceId: string): Promise<void>;
    estimateCost(gpuType: string, hours: number): Promise<number>;
}
