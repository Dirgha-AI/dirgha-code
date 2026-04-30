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
 *   5. Steering and follow-up queues allow mid-flight control (see queues.ts).
 */
import type { Message, AgentMessage, AgentResult, ToolDefinition, Provider, ToolExecutor, ApprovalBus, ErrorClassifier, AgentHooks } from './types.js';
import type { EventStream } from './event-stream.js';
/**
 * Controller interface for mid-flight agent steering and follow-up.
 *
 * Exposed via `cfg.controller` so callers can inject messages without
 * changing the return type of `runAgentLoop` (which remains
 * `Promise<AgentResult>` for backwards compatibility).
 *
 * Usage:
 *   const controller = { steer: (msg) => {}, followUp: (msg) => {} };
 *   const result = await runAgentLoop({ ...cfg, controller });
 *   // Later, from another context:
 *   controller.steer({ role: 'user', content: 'Stop and do this instead' });
 */
export interface AgentController {
    /** Queue a steering message (drain mode: all). Replaces current turn. */
    steer: (msg: AgentMessage) => void;
    /** Queue a follow-up message (drain mode: one-at-a-time). Runs after current turn. */
    followUp: (msg: AgentMessage) => void;
}
export interface AgentLoopConfig {
    sessionId: string;
    model: string;
    /**
     * Initial transcript. Plain `Message[]` is accepted (a `Message` is a
     * structural `AgentMessage` since `ui` and `hidden` are optional), so
     * existing callers keep working unchanged.
     */
    messages: AgentMessage[];
    tools: ToolDefinition[];
    maxTurns: number;
    provider: Provider;
    toolExecutor: ToolExecutor;
    events: EventStream;
    approvalBus?: ApprovalBus;
    /**
     * When true, every tool call is auto-approved without going through
     * the ApprovalBus. Set by `dirgha --yolo` or by the YOLO mode
     * preamble. The ApprovalBus is otherwise the sole gate.
     */
    autoApprove?: boolean;
    errorClassifier?: ErrorClassifier;
    hooks?: AgentHooks;
    /**
     * Per-turn context transform. Receives the full transcript (post-projection
     * to `Message[]`) and returns the messages to actually send to the model.
     * Kept on `Message[]` so existing transforms (compaction, etc.) need no
     * changes.
     */
    contextTransform?: (messages: Message[]) => Promise<Message[]>;
    toolConcurrency?: 'serial' | 'parallel';
    signal?: AbortSignal;
    /**
     * Optional controller for mid-flight steering and follow-up.
     * When provided, the caller can inject messages via `steer()` and `followUp()`.
     * The controller object is populated with function references during loop
     * initialisation (mutated in-place so the caller sees them).
     */
    controller?: AgentController;
}
export declare function runAgentLoop(cfg: AgentLoopConfig): Promise<AgentResult>;
