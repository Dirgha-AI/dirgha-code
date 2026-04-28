/**
 * Hook registry. Hooks fire at named lifecycle events: session_start,
 * session_end, turn_start, turn_end, tool_call_before, tool_call_after,
 * compaction_before, compaction_after. Each handler may veto by
 * returning { block: true, reason }, in which case the caller decides
 * how to react.
 */

export type HookEvent =
  | 'session_start'
  | 'session_end'
  | 'turn_start'
  | 'turn_end'
  | 'tool_call_before'
  | 'tool_call_after'
  | 'compaction_before'
  | 'compaction_after'
  | 'message_user'
  | 'message_assistant';

export type HookBlock = { block: true; reason: string };
export type HookResult = void | HookBlock;

export type HookHandler<T = unknown> = (payload: T) => HookResult | Promise<HookResult>;

export class HookRegistry {
  private handlers = new Map<HookEvent, Set<HookHandler>>();

  on<T = unknown>(event: HookEvent, handler: HookHandler<T>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as HookHandler);
    return () => { set?.delete(handler as HookHandler); };
  }

  async emit<T = unknown>(event: HookEvent, payload: T): Promise<HookBlock | undefined> {
    const set = this.handlers.get(event);
    if (!set) return undefined;
    for (const handler of set) {
      const outcome = await handler(payload);
      if (outcome && outcome.block) return outcome;
    }
    return undefined;
  }

  clear(event?: HookEvent): void {
    if (event) this.handlers.get(event)?.clear();
    else this.handlers.clear();
  }
}

export function createHookRegistry(): HookRegistry {
  return new HookRegistry();
}
