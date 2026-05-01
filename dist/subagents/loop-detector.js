const DEFAULT_LOOP_CONFIG = {
    maxRepeatedToolCalls: 5,
    maxTurnsWithoutProgress: 3,
};
export class LoopDetector {
    config;
    toolCallHistory = new Map();
    turnsWithoutProgress = 0;
    lastOutputHash = null;
    constructor(config = {}) {
        this.config = { ...DEFAULT_LOOP_CONFIG, ...config };
    }
    track(turn) {
        if (turn.toolCalls && turn.toolCalls.length > 0) {
            for (const tc of turn.toolCalls) {
                const key = `${tc.name}:${JSON.stringify(tc.args ?? {})}`;
                const count = (this.toolCallHistory.get(key) ?? 0) + 1;
                this.toolCallHistory.set(key, count);
            }
        }
        if (turn.message) {
            const hash = typeof turn.message.content === "string"
                ? turn.message.content.slice(0, 500)
                : JSON.stringify(turn.message.content).slice(0, 500);
            if (this.lastOutputHash === hash) {
                this.turnsWithoutProgress++;
            }
            else {
                this.turnsWithoutProgress = 0;
                this.lastOutputHash = hash;
            }
        }
    }
    isLoopDetected() {
        // Check repeated tool calls
        for (const count of this.toolCallHistory.values()) {
            if (count >= this.config.maxRepeatedToolCalls)
                return true;
        }
        // Check output stagnation
        if (this.turnsWithoutProgress >= this.config.maxTurnsWithoutProgress)
            return true;
        return false;
    }
    reason() {
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
    reset() {
        this.toolCallHistory.clear();
        this.turnsWithoutProgress = 0;
        this.lastOutputHash = null;
    }
}
//# sourceMappingURL=loop-detector.js.map