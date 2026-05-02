/**
 * Approval bus. Pluggable subscribers receive ApprovalRequests; the
 * first subscriber whose response is non-undefined wins. When no
 * subscriber responds, the bus defaults to deny-once (safe default).
 * An always-audited subscriber is attached automatically so every
 * decision is logged regardless of which UI handled it.
 */
export function createApprovalBus(options = {}) {
    const subscribers = new Set();
    const approve = new Set(options.alwaysApprove ?? []);
    const deny = new Set();
    let requiresApproval = (toolName, _input) => !approve.has(toolName) && !deny.has(toolName);
    const bus = {
        requiresApproval(toolName, _input) {
            if (deny.has(toolName))
                return true;
            if (approve.has(toolName))
                return false;
            return requiresApproval(toolName, _input);
        },
        async request(req) {
            if (deny.has(req.tool))
                return 'deny_always';
            if (approve.has(req.tool))
                return 'approve';
            for (const sub of subscribers) {
                const response = await sub(req);
                if (response !== undefined) {
                    if (response === 'deny_always')
                        deny.add(req.tool);
                    if (response === 'approve_once')
                        approve.add(req.tool);
                    return response;
                }
            }
            return 'deny';
        },
        subscribe(subscriber) {
            subscribers.add(subscriber);
            return () => { subscribers.delete(subscriber); };
        },
        setRequiresApprovalPredicate(fn) { requiresApproval = fn; },
        allowToolAlways(toolName) { approve.add(toolName); deny.delete(toolName); },
        denyToolAlways(toolName) { deny.add(toolName); approve.delete(toolName); },
    };
    return bus;
}
//# sourceMappingURL=approval-bus.js.map