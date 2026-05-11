/**
 * gpu/akash.ts — Akash Network GPU compute adapter
 *
 * Akash Network: decentralized cloud marketplace.
 * Cheapest GPU option for many workloads.
 * Uses the Akash provider-services CLI or direct API.
 */
import type { GPUProvider, GPUType, GPUProvisionConfig, GPUInstance } from "./providers.js";
export declare class AkashProvider implements GPUProvider {
    readonly name = "akash";
    listGPUTypes(): Promise<GPUType[]>;
    provision(config: GPUProvisionConfig): Promise<GPUInstance>;
    getStatus(instanceId: string): Promise<GPUInstance>;
    getLogs(_instanceId: string): Promise<string>;
    destroy(instanceId: string): Promise<void>;
    estimateCost(gpuType: string, hours: number): Promise<number>;
}
