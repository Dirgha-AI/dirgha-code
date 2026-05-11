/**
 * gpu/market.ts — GPU marketplace tools that interact with the
 * Abundance protocol (Bucky marketplace on api.dirgha.ai).
 *
 * Users can list GPU compute for rent, find GPU compute from others,
 * and settle payments via the existing escrow system.
 */
export interface GPUListing {
    id?: string;
    gpuType: string;
    vramGb: number;
    pricePerHr: number;
    provider: string;
    region?: string;
    available: boolean;
    createdBy?: string;
}
export declare function postGPUListing(listing: GPUListing): Promise<GPUListing>;
export declare function listGPUListings(minVramGb?: number, maxPrice?: number): Promise<GPUListing[]>;
export interface GPUJob {
    id?: string;
    gpuType: string;
    listingId: string;
    durationHrs: number;
    totalCost: number;
    status: "pending" | "running" | "completed" | "disputed";
}
export declare function postGPUJob(job: Omit<GPUJob, "id" | "status">): Promise<GPUJob>;
export declare function getGPUJobStatus(jobId: string): Promise<GPUJob>;
export declare function settleGPUJob(jobId: string): Promise<void>;
