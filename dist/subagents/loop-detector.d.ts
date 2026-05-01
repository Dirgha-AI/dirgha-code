/**
 * Sub-agent loop detector — ported from monorepo agent/loop-detector.ts.
 *
 * Detects infinite tool-calling loops in sub-agents by tracking:
 * 1. Repeated tool calls with identical args
 * 2. No-progress patterns (output stagnation)
 * 3. Excessive turns without task completion
 */
import type { Message } from "../kernel/types.js";
export interface LoopConfig {
    maxRepeatedToolCalls: number;
    maxTurnsWithoutProgress: number;
}
export declare class LoopDetector {
    private config;
    private toolCallHistory;
    private turnsWithoutProgress;
    private lastOutputHash;
    constructor(config?: Partial<LoopConfig>);
    track(turn: {
        toolCalls?: Array<{
            name: string;
            args?: Record<string, unknown>;
        }>;
        message?: Message;
    }): void;
    isLoopDetected(): boolean;
    reason(): string | null;
    reset(): void;
}
