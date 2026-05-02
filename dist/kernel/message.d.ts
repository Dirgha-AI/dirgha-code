/**
 * Message manipulation helpers. Pure functions over Message[].
 */
import type { Message, ContentPart, ToolUsePart, AgentEvent } from "./types.js";
export declare function normaliseContent(msg: Message): ContentPart[];
export declare function extractText(msg: Message): string;
export declare function extractToolUses(msg: Message): ToolUsePart[];
export declare function toolResultMessage(toolUseId: string, content: string, isError?: boolean, role?: "user" | "tool"): Message;
export declare function appendToolResults(history: Message[], results: Array<{
    toolUseId: string;
    content: string;
    isError: boolean;
}>): Message[];
/**
 * Streaming assembly: fold AgentEvents into a single assistant Message.
 *
 * Accepts the sequence of provider events for one turn and returns the
 * finalised assistant Message plus token-use totals. Partial tool-call
 * JSON deltas are concatenated and parsed at toolcall_end.
 */
export interface AssembledTurn {
    message: Message;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
}
export declare function assembleTurn(events: AgentEvent[]): AssembledTurn;
/** Rough cl100k heuristic: ~4 characters per token. */
export declare function estimateTokens(text: string): number;
