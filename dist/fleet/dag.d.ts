/**
 * Fleet DAG — sequential agent-to-agent chaining.
 *
 * Usage:
 *   dirgha fleet dag "step1: investigate auth flow" "step2: implement fix based on step1" "step3: verify fix"
 *
 * Each step runs as an independent agent in a shared worktree. Step N
 * receives the full transcript of step N-1 as its context so the chain
 * builds cumulatively. The final step's output is the DAG result.
 */
import type { Message, UsageTotal } from "../kernel/types.js";
import type { ProviderRegistry } from "../providers/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { DirghaConfig } from "../cli/config.js";
export interface DagStep {
    goal: string;
}
export interface DagResult {
    steps: Array<{
        goal: string;
        stopReason: string;
        output: string;
        usage: UsageTotal;
        messages: Message[];
    }>;
    usage: UsageTotal;
    success: boolean;
}
export interface DagOptions {
    steps: DagStep[];
    config: DirghaConfig;
    providers: ProviderRegistry;
    registry: ToolRegistry;
    cwd: string;
    sessionId?: string;
    maxTurnsPerStep?: number;
}
export declare function runDag(opts: DagOptions): Promise<DagResult>;
