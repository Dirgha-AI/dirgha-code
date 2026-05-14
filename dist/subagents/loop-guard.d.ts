/**
 * Unified loop guard. Replaces the dual mechanism of LoopDetector
 * (output stagnation + identical tool calls) plus REFUSAL_ABORT_THRESHOLD
 * (identical refused tool calls) that previously lived in agent-loop.ts.
 *
 * Detects four loop patterns:
 *   1. Same tool + identical args called >= maxRepeatedToolCalls times.
 *   2. Same tool + args + result.isError=true >= maxIdenticalRefusals times.
 *   3. Same tool + args + content-prefix repeated >= maxIdenticalContentRepeats times.
 *   4. Assistant output hash unchanged for >= maxTurnsWithoutProgress turns.
 */
import type { Message, ToolCall, ToolResult } from '../kernel/types.js';
export interface LoopGuardConfig {
    maxRepeatedToolCalls: number;
    maxTurnsWithoutProgress: number;
    maxIdenticalRefusals: number;
    maxIdenticalContentRepeats: number;
    contentPrefixLen: number;
}
export declare class StableLoopGuard {
    private readonly config;
    private toolCallHistory;
    private refusalHistory;
    private contentRefusalHistory;
    private turnsWithoutProgress;
    private lastOutputHash;
    private lastTriggeredReason;
    constructor(config?: Partial<LoopGuardConfig>);
    /**
     * Record one observed tool call and its result.
     * Increments the relevant counters and updates the stagnation hash.
     */
    observe(call: ToolCall, result: ToolResult): void;
    /**
     * Record one observed assistant message. Used for output-stagnation detection.
     * Hash is the first contentPrefixLen chars of the message content.
     */
    observeMessage(message: Message | undefined): void;
    /**
     * Returns true if any of the four loop patterns has crossed its threshold.
     * Side effect: caches the reason for the next reason() call.
     */
    isLoopDetected(): boolean;
    /**
     * Returns the reason for the most recent loop detection, or null if not loop.
     */
    reason(): string | null;
    /**
     * Reset all state. Called between user prompts so loops don't carry across.
     */
    reset(): void;
}
/**
 * Legacy alias for backward compat with existing code that imports LoopDetector.
 * The old LoopDetector had different methods (track, isLoopDetected, reason, reset)
 * but the same semantic intent. New code should use StableLoopGuard directly.
 */
export { StableLoopGuard as LoopDetector };
