/**
 * gpu/vast.ts — Vast.ai GPU compute adapter
 *
 * Vast.ai is the cheapest GPU marketplace. Interruptible instances
 * are 50%+ cheaper than on-demand with per-second billing.
 * Prices change based on supply/demand.
 */
import type { GPUProvider, GPUType, GPUProvisionConfig, GPUInstance } from "./providers.js";
export declare class VastProvider implements GPUProvider {
    readonly name = "vast";
    listGPUTypes(): Promise<GPUType[]>;
    provision(config: GPUProvisionConfig): Promise<GPUInstance>;
    getStatus(instanceId: string): Promise<GPUInstance>;
    getLogs(_instanceId: string): Promise<string>;
    destroy(instanceId: string): Promise<void>;
    estimateCost(gpuType: string, hours: number): Promise<number>;
}
