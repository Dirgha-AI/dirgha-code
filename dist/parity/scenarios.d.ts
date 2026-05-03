/**
 * Scripted parity scenarios. Each scenario describes a sequence of
 * inputs (messages, tool stubs) and the expected event sequence from
 * the provider adapter under test. Scenarios are format-agnostic; the
 * runner maps them onto mock HTTP servers per provider.
 */
import type { AgentEvent, Message, ToolDefinition } from "../kernel/types.js";
export interface ParityScenario {
    name: string;
    provider: "nvidia" | "openrouter" | "openai" | "anthropic" | "gemini";
    model: string;
    request: {
        messages: Message[];
        tools?: ToolDefinition[];
    };
    /** Mock SSE response lines (without the leading `data:` prefix). */
    mockChunks: string[];
    expectedEventTypes: Array<AgentEvent["type"]>;
}
export declare const DEFAULT_SCENARIOS: ParityScenario[];
