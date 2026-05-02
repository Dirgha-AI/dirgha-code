/**
 * Subagent delegation.
 *
 * Exposes a task executor that spawns an isolated agent-loop instance
 * with its own session, its own event stream, and an optional restricted
 * tool subset. The parent receives only the final text output; the full
 * transcript is preserved in the child session for audit.
 */
import type { Provider, UsageTotal, Message } from "../kernel/types.js";
import type { ToolRegistry } from "../tools/registry.js";
/**
 * Safe default tool allowlist for sub-agents. Covers read/write/search and
 * common dev operations while excluding high-privilege tools (e.g. network
 * requests, approval bypass, registry mutation). A parent agent can grant
 * additional tools by supplying an explicit toolAllowlist on SubagentRequest.
 */
export declare const DEFAULT_SUBAGENT_TOOLS: Set<string>;
export interface SubagentRequest {
    prompt: string;
    system?: string;
    toolAllowlist?: string[];
    maxTurns?: number;
    model?: string;
    tokenBudget?: number;
}
export interface SubagentResult {
    output: string;
    usage: UsageTotal;
    transcript: Message[];
    stopReason: string;
    sessionId: string;
}
export interface DelegatorOptions {
    registry: ToolRegistry;
    provider: Provider;
    defaultModel: string;
    cwd: string;
    parentSessionId: string;
}
export declare class SubagentDelegator {
    private opts;
    constructor(opts: DelegatorOptions);
    delegate(req: SubagentRequest): Promise<SubagentResult>;
}
