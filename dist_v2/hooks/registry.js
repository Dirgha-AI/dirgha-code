/**
 * Hook registry. Hooks fire at named lifecycle events: session_start,
 * session_end, turn_start, turn_end, tool_call_before, tool_call_after,
 * compaction_before, compaction_after. Each handler may veto by
 * returning { block: true, reason }, in which case the caller decides
 * how to react.
 */
export class HookRegistry {
    handlers = new Map();
    on(event, handler) {
        let set = this.handlers.get(event);
        if (!set) {
            set = new Set();
            this.handlers.set(event, set);
        }
        set.add(handler);
        return () => { set?.delete(handler); };
    }
    async emit(event, payload) {
        const set = this.handlers.get(event);
        if (!set)
            return undefined;
        for (const handler of set) {
            const outcome = await handler(payload);
            if (outcome && outcome.block)
                return outcome;
        }
        return undefined;
    }
    clear(event) {
        if (event)
            this.handlers.get(event)?.clear();
        else
            this.handlers.clear();
    }
}
export function createHookRegistry() {
    return new HookRegistry();
}
//# sourceMappingURL=registry.js.map