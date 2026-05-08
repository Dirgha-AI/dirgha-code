/**
 * db_workspace_info tool — agent-facing introspection of the per-session
 * SQLite workspace (Sprint 7 — docs/cli/index/agent-db.md).
 *
 * Returns DB path, schema tables, vec extension status, row counts.
 * The agent calls this before a multi-model write so it knows what's
 * actually wired up before the transactional_write tool fires.
 */
import { openDb } from "../state/db.js";
export const dbWorkspaceInfoTool = {
    name: "db_workspace_info",
    description: "Inspect the per-session SQLite workspace. Returns DB path, schema " +
        "tables, vec extension status, and row counts for messages, " +
        "graph_nodes, graph_edges, and embedding_meta. Useful before a " +
        "multi-model write to confirm what's available.",
    inputSchema: { type: "object", properties: {} },
    async execute(_input, _ctx) {
        let db;
        try {
            db = openDb();
        }
        catch (err) {
            return {
                content: `db_workspace_info failed: ${err.message}`,
                isError: true,
            };
        }
        let vecVersion = null;
        try {
            vecVersion = db.prepare("SELECT vec_version() AS v").get().v;
        }
        catch {
            /* extension absent — leave null */
        }
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','virtual') ORDER BY name")
            .all().map((r) => r.name);
        const counts = {};
        for (const t of [
            "messages",
            "graph_nodes",
            "graph_edges",
            "embedding_meta",
        ]) {
            try {
                counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
            }
            catch {
                counts[t] = -1;
            }
        }
        const dbPath = db.name;
        const sqliteVersion = db.prepare("SELECT sqlite_version() AS v").get().v;
        const data = {
            dbPath,
            sqliteVersion,
            vecVersion,
            tables,
            counts,
        };
        const lines = [
            `db_path: ${dbPath}`,
            `sqlite: ${sqliteVersion}`,
            `vec: ${vecVersion ?? "(extension not loaded)"}`,
            `tables: ${tables.join(", ")}`,
            `counts:`,
            ...Object.entries(counts).map(([k, v]) => `  ${k}: ${v}`),
        ];
        return {
            content: lines.join("\n"),
            data,
            isError: false,
        };
    },
};
//# sourceMappingURL=db-workspace-info.js.map