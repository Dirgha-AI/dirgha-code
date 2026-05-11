/**
 * gpu/jobs.ts — Persistent GPU job queue + budget tracker
 *
 * Stores running/completed GPU jobs in ~/.dirgha/gpu-jobs.json.
 * Enforces budget caps set via `dirgha config set gpu-budget $50`.
 * Writes audit log to ~/.dirgha/gpu-audit.jsonl.
 */
export type GPUJobStatus = "running" | "completed" | "failed" | "cancelled";
export interface GPUJob {
    id: string;
    status: GPUJobStatus;
    provider: string;
    gpuType: string;
    costPerHr: number;
    totalCost: number;
    startedAt: string;
    completedAt?: string;
    instanceId?: string;
    error?: string;
}
/** Check if a new GPU job would exceed the budget. Returns error string or null. */
export declare function checkBudget(costPerHr: number, estimatedHours: number): Promise<string | null>;
export declare function setBudget(amount: number): void;
export declare function getBudget(): number;
export declare function registerGPUJob(opts: {
    provider: string;
    gpuType: string;
    costPerHr: number;
    instanceId?: string;
}): Promise<GPUJob>;
export declare function completeGPUJob(jobId: string, status: "completed" | "failed" | "cancelled", error?: string): Promise<GPUJob | null>;
export declare function listGPUJobs(status?: GPUJobStatus): Promise<GPUJob[]>;
export declare function getGPUJob(jobId: string): Promise<GPUJob | null>;
export declare function totalGPUSpend(): Promise<number>;
/** Read recent audit log entries */
export declare function auditLog(limit?: number): Promise<string[]>;
