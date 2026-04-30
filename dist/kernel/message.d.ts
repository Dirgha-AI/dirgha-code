/**
 * Message manipulation helpers. Pure functions over Message[].
 */
import type { AgentMessage, Message, ContentPart, ToolUsePart, AgentEvent } from './types.js';
/**
 * Projection boundary: convert kernel-internal `AgentMessage[]` (which may
 * carry UI-only metadata) into the clean `Message[]` shape that providers
 * actually send to the LLM.
 *
 * Behaviour:
 *   - Filters out any entry with `hidden === true`.
 *   - Strips the `ui` field from the remaining entries.
 *   - Preserves order.
 *   - Pure: does not mutate the input array or its elements.
 *
 * This is the ONLY seam the agent loop should use when handing messages
 * off to a `Provider.stream` call. Keeping it a single function makes the
 * UI/LLM boundary auditable.
 */
export declare function convertToLlm(messages: AgentMessage[]): Message[];
export declare function normaliseContent(msg: Message): ContentPart[];
export declare function extractText(msg: Message): string;
export declare function extractToolUses(msg: Message): ToolUsePart[];
export declare function toolResultMessage(toolUseId: string, content: string, isError?: boolean): Message;
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
