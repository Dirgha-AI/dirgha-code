/** The call object that is passed to a tool executor. */
export interface ToolCall {
    readonly id: string;
    readonly name: string;
    readonly input: Record<string, unknown>;
    /** Optional per‑call timeout override (ms). */
    readonly timeoutMs?: number;
}
/** The result returned by a tool executor. */
export interface ToolResult {
    readonly content: string;
    readonly isError: boolean;
}
/** A function that executes a tool call and returns a result. */
export type ToolExecutor = (call: ToolCall, signal: AbortSignal) => Promise<ToolResult>;
/**
 * Wraps a {@link ToolExecutor} so that each call is aborted after
 * `timeoutMs` (or the call‑specific `call.timeoutMs` value, if present).
 *
 * If the timeout fires, the wrapped executor returns a result with
 * `content: "[TIMEOUT] Xms exceeded"` and `isError: true`.
 *
 * @param executor  The original executor to wrap.
 * @param defaultMs Default timeout in milliseconds (300 000 ms = 5 min).
 * @returns A new {@link ToolExecutor} that respects the timeout.
 */
export declare function withToolTimeout(executor: ToolExecutor, defaultMs?: number): ToolExecutor;
