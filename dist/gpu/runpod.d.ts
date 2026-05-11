/**
 * gpu/runpod.ts — RunPod GPU compute adapter
 *
 * RunPod API docs: https://docs.runpod.io/api-reference
 * Pricing: A100 80GB $0.49/hr, A100 40GB $0.39/hr, 4090 $0.29/hr
 *
 * Uses the RunPod serverless GPU endpoints API.
 */
import type { GPUProvider, GPUType, GPUProvisionConfig, GPUInstance } from "./providers.js";
export declare class RunPodProvider implements GPUProvider {
    readonly name = "runpod";
    listGPUTypes(): Promise<GPUType[]>;
    provision(config: GPUProvisionConfig): Promise<GPUInstance>;
    getStatus(instanceId: string): Promise<GPUInstance>;
    getLogs(instanceId: string): Promise<string>;
    destroy(instanceId: string): Promise<void>;
    estimateCost(gpuType: string, hours: number): Promise<number>;
}
