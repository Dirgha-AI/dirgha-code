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

const DEFAULT_LOOP_CONFIG: LoopConfig = {
  maxRepeatedToolCalls: 5,
  maxTurnsWithoutProgress: 3,
};

export class LoopDetector {
  private config: LoopConfig;
  private toolCallHistory: Map<string, number> = new Map();
  private turnsWithoutProgress = 0;
  private lastOutputHash: string | null = null;

  constructor(config: Partial<LoopConfig> = {}) {
    this.config = { ...DEFAULT_LOOP_CONFIG, ...config };
  }

  track(turn: {
    toolCalls?: Array<{ name: string; args?: Record<string, unknown> }>;
    message?: Message;
  }): void {
    if (turn.toolCalls && turn.toolCalls.length > 0) {
      for (const tc of turn.toolCalls) {
        const key = `${tc.name}:${JSON.stringify(tc.args ?? {})}`;
        const count = (this.toolCallHistory.get(key) ?? 0) + 1;
        this.toolCallHistory.set(key, count);
      }
    }
    if (turn.message) {
      const hash =
        typeof turn.message.content === "string"
          ? turn.message.content.slice(0, 500)
          : JSON.stringify(turn.message.content).slice(0, 500);
      if (this.lastOutputHash === hash) {
        this.turnsWithoutProgress++;
      } else {
        this.turnsWithoutProgress = 0;
        this.lastOutputHash = hash;
      }
    }
  }

  isLoopDetected(): boolean {
    // Check repeated tool calls
    for (const count of this.toolCallHistory.values()) {
      if (count >= this.config.maxRepeatedToolCalls) return true;
    }
    // Check output stagnation
    if (this.turnsWithoutProgress >= this.config.maxTurnsWithoutProgress)
      return true;
    return false;
  }

  reason(): string | null {
    for (const [key, count] of this.toolCallHistory) {
      if (count >= this.config.maxRepeatedToolCalls) {
        return `repeated tool call: ${key} (${count}x)`;
      }
    }
    if (this.turnsWithoutProgress >= this.config.maxTurnsWithoutProgress) {
      return `output stagnation: ${this.turnsWithoutProgress} turns without progress`;
    }
    return null;
  }

  reset(): void {
    this.toolCallHistory.clear();
    this.turnsWithoutProgress = 0;
    this.lastOutputHash = null;
  }
}
