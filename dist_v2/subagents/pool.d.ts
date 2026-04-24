/**
 * Bounded-concurrency pool for subagent delegations. Delegations beyond
 * the concurrency cap are queued FIFO; the pool never drops requests.
 */
import type { SubagentDelegator, SubagentRequest, SubagentResult } from './delegator.js';
export interface SubagentPoolOptions {
    delegator: SubagentDelegator;
    maxConcurrent?: number;
}
export declare class SubagentPool {
    private opts;
    private inflight;
    private queue;
    private readonly max;
    constructor(opts: SubagentPoolOptions);
    delegate(req: SubagentRequest): Promise<SubagentResult>;
    private drain;
}
