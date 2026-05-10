import { useState, useEffect, useRef } from "react";
export function useToolProgress(events) {
    const [tools, setTools] = useState([]);
    // Map<id, { name, startedAt }>
    const activeRef = useRef(new Map());
    // Subscribe to the event stream
    useEffect(() => {
        // Clear any stale tools from a previous subscription
        activeRef.current.clear();
        const unsubscribe = events.subscribe((event) => {
            // Narrow the event shape – the kernel guarantees these shapes.
            if (event.type === "tool_exec_start") {
                const { id, name } = event;
                activeRef.current.set(id, { name, startedAt: Date.now() });
            }
            else if (event.type === "tool_exec_end") {
                const { id } = event;
                activeRef.current.delete(id);
            }
        });
        return unsubscribe;
    }, [events]);
    // Update elapsed times every second
    useEffect(() => {
        const interval = setInterval(() => {
            if (activeRef.current.size === 0) {
                setTools((prev) => (prev.length === 0 ? prev : []));
                return;
            }
            const now = Date.now();
            const entries = [];
            for (const [id, { name, startedAt }] of activeRef.current.entries()) {
                entries.push({ id, name, elapsedMs: now - startedAt, startedAt });
            }
            // Sort by startedAt ascending so the oldest running tool appears first
            entries.sort((a, b) => a.startedAt - b.startedAt);
            setTools(entries.map(({ id, name, elapsedMs }) => ({ id, name, elapsedMs })));
        }, 1000);
        return () => clearInterval(interval);
    }, []);
    return tools;
}
//# sourceMappingURL=use-tool-progress.js.map