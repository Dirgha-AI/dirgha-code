/**
 * graph_neighbors tool — one-hop graph neighbour lookup.
 *
 * Returns immediate neighbours of a graph node via directed edges.
 * Filterable by relation label and direction (out/in/both).
 * Uses the same SQLite DB as the relational + FTS stores.
 */
import { openDb } from "../state/db.js";
export const graphNeighborsTool = {
    name: "graph_neighbors",
    description: "Return the immediate (one-hop) neighbours of a graph node. Filter by " +
        "relation label and direction. 'out' = outgoing edges (this node is " +
        "the source); 'in' = incoming; 'both' = union.",
    inputSchema: {
        type: "object",
        properties: {
            node_id: { type: "string" },
            rel: { type: "string" },
            direction: { type: "string", enum: ["out", "in", "both"] },
        },
        required: ["node_id"],
    },
    async execute(rawInput, _ctx) {
        const input = rawInput;
        if (!input.node_id) {
            return { content: "node_id is required", isError: true };
        }
        const dir = input.direction ?? "out";
        const db = openDb();
        const rows = [];
        try {
            if (dir === "out" || dir === "both") {
                const sql = input.rel
                    ? `SELECT e.dst AS id, e.rel, n.type, n.props
             FROM graph_edges e LEFT JOIN graph_nodes n ON n.id = e.dst
             WHERE e.src = ? AND e.rel = ? ORDER BY e.ts`
                    : `SELECT e.dst AS id, e.rel, n.type, n.props
             FROM graph_edges e LEFT JOIN graph_nodes n ON n.id = e.dst
             WHERE e.src = ? ORDER BY e.ts`;
                const params = input.rel
                    ? [input.node_id, input.rel]
                    : [input.node_id];
                for (const r of db.prepare(sql).all(...params)) {
                    rows.push({ ...r, direction: "out" });
                }
            }
            if (dir === "in" || dir === "both") {
                const sql = input.rel
                    ? `SELECT e.src AS id, e.rel, n.type, n.props
             FROM graph_edges e LEFT JOIN graph_nodes n ON n.id = e.src
             WHERE e.dst = ? AND e.rel = ? ORDER BY e.ts`
                    : `SELECT e.src AS id, e.rel, n.type, n.props
             FROM graph_edges e LEFT JOIN graph_nodes n ON n.id = e.src
             WHERE e.dst = ? ORDER BY e.ts`;
                const params = input.rel
                    ? [input.node_id, input.rel]
                    : [input.node_id];
                for (const r of db.prepare(sql).all(...params)) {
                    rows.push({ ...r, direction: "in" });
                }
            }
        }
        catch (err) {
            return {
                content: `graph_neighbors failed: ${err.message}`,
                isError: true,
            };
        }
        const summary = rows.length === 0
            ? `no neighbours of ${input.node_id}${input.rel ? ` via ${input.rel}` : ""}`
            : rows
                .map((n) => `${n.direction === "out" ? "→" : "←"} ${n.id} (${n.rel}) [${n.type ?? "?"}]`)
                .join("\n");
        return { content: summary, data: rows, isError: false };
    },
};
//# sourceMappingURL=graph-neighbors.js.map