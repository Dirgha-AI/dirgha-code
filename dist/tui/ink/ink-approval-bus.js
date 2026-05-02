/**
 * Ink-native approval bus.
 *
 * Replaces `tui/approval.ts`'s `createTuiApprovalBus`, which wrote the
 * approval prompt directly to `process.stdout` and read `process.stdin`
 * raw. Inside Ink that approach has two problems:
 *   1. Ink's differential renderer overdraws stdout writes — the user
 *      never sees the "Approve X? [y/n/a/d]" line.
 *   2. Stdin raw-mode handoff between Ink (owns it for `useInput`) and
 *      the approval reader hangs on Windows console; on Linux it sort
 *      of works but is fragile.
 *
 * This bus is purely in-memory: callers `await bus.request({...})` and
 * the React tree subscribes via `bus.subscribe()` to render an
 * `<ApprovalPrompt>` component. The user's `[y|n|a|d]` keypress goes
 * through `useInput` (no raw-mode contention); the component calls
 * `bus.resolve(id, decision)` to settle the awaited promise.
 *
 * `autoApproveTools` works the same as the legacy bus — names in this
 * set bypass the prompt entirely.
 */
export function createInkApprovalBus(autoApprove = new Set()) {
    const resolvers = new Map();
    const listeners = new Set();
    let denied = false;
    const emit = (req) => {
        for (const l of listeners)
            l(req);
    };
    return {
        requiresApproval(toolName) {
            // When denyAll() was called, return true so the kernel calls request(),
            // which returns 'deny'. Returning false would skip the approval gate
            // entirely and let the tool execute unconditionally.
            if (denied)
                return true;
            return !autoApprove.has(toolName);
        },
        async request(req) {
            // Honor deny-all without prompting.
            if (denied)
                return 'deny';
            // Defensive: if the tool was added to autoApprove between
            // requiresApproval and request, just approve.
            if (autoApprove.has(req.tool))
                return 'approve';
            return new Promise((resolve) => {
                resolvers.set(req.id, (decision) => {
                    // Propagate side-effects of the decision before settling.
                    if (decision === 'approve_once')
                        autoApprove.add(req.tool);
                    if (decision === 'deny_always')
                        denied = true;
                    resolve(decision);
                });
                emit(req);
            });
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        resolve(id, decision) {
            const resolver = resolvers.get(id);
            if (!resolver)
                return;
            resolvers.delete(id);
            // Clear the "active request" notification first so the UI can
            // unmount the prompt before firing the next one (if any).
            emit(null);
            resolver(decision);
        },
        alwaysApprove(toolName) {
            autoApprove.add(toolName);
        },
        denyAll() {
            denied = true;
            // Settle any pending requests as 'deny'.
            for (const [id, resolver] of resolvers) {
                resolver('deny');
                resolvers.delete(id);
            }
            emit(null);
        },
    };
}
//# sourceMappingURL=ink-approval-bus.js.map