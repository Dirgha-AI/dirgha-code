/**
 * Agent loop: ReAct with optional plan-then-execute.
 *
 * The loop is the sole caller of Provider.stream and the sole caller of
 * ToolExecutor.execute. All layering conventions are enforced here:
 *
 *   1. Every tool call passes through the ApprovalBus seam.
 *   2. Every event flows through the EventStream (no side-channels).
 *   3. Errors from providers are classified by the injected ErrorClassifier
 *      before any retry decision; there is no string matching.
 *   4. Context transform (compaction, skill injection) is invoked once per
 *      turn before the provider call, never mid-stream.
 */
import type { Message, AgentResult, ToolDefinition, Provider, ToolExecutor, ApprovalBus, ErrorClassifier, AgentHooks } from "./types.js";
import type { EventStream } from "./event-stream.js";
export interface AgentLoopConfig {
    sessionId: string;
    model: string;
    messages: Message[];
    tools: ToolDefinition[];
    maxTurns: number;
    provider: Provider;
    toolExecutor: ToolExecutor;
    events: EventStream;
    approvalBus?: ApprovalBus;
    errorClassifier?: ErrorClassifier;
    hooks?: AgentHooks;
    contextTransform?: (messages: Message[]) => Promise<Message[]>;
    toolConcurrency?: "serial" | "parallel";
    signal?: AbortSignal;
    /**
     * When true, every approval-required tool call is auto-granted
     * without going through the ApprovalBus. Set by `dirgha --yolo` or
     * by the YOLO mode preamble. The ApprovalBus is otherwise the
     * canonical gate for risky operations (writes outside cwd, shell,
     * git mutations, etc.).
     */
    autoApprove?: boolean;
    costCalculator?: (input: number, output: number, cached: number) => number;
}
export declare function runAgentLoop(cfg: AgentLoopConfig): Promise<AgentResult>;
