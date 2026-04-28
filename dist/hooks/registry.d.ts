/**
 * Hook registry. Hooks fire at named lifecycle events: session_start,
 * session_end, turn_start, turn_end, tool_call_before, tool_call_after,
 * compaction_before, compaction_after. Each handler may veto by
 * returning { block: true, reason }, in which case the caller decides
 * how to react.
 */
export type HookEvent = 'session_start' | 'session_end' | 'turn_start' | 'turn_end' | 'tool_call_before' | 'tool_call_after' | 'compaction_before' | 'compaction_after' | 'message_user' | 'message_assistant';
export type HookBlock = {
    block: true;
    reason: string;
};
export type HookResult = void | HookBlock;
export type HookHandler<T = unknown> = (payload: T) => HookResult | Promise<HookResult>;
export declare class HookRegistry {
    private handlers;
    on<T = unknown>(event: HookEvent, handler: HookHandler<T>): () => void;
    emit<T = unknown>(event: HookEvent, payload: T): Promise<HookBlock | undefined>;
    clear(event?: HookEvent): void;
}
export declare function createHookRegistry(): HookRegistry;
