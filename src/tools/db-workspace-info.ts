/**
 * db_workspace_info tool — agent-facing introspection of the per-session
 * SQLite workspace (Sprint 7 — docs/cli/index/agent-db.md).
 *
 * Returns DB path, schema tables, vec extension status, row counts.
 * The agent calls this before a multi-model write so it knows what's
 * actually wired up before the transactional_write tool fires.
 */

import type { Tool } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";
import { openDb } from "../state/db.js";

interface WorkspaceInfo {
  dbPath: string;
  sqliteVersion: string;
  vecVersion: string | null;
  tables: string[];
  counts: Record<string, number>;
}

export const dbWorkspaceInfoTool: Tool = {
  name: "db_workspace_info",
  description:
    "Inspect the per-session SQLite workspace. Returns DB path, schema " +
    "tables, vec extension status, and row counts for messages, " +
    "graph_nodes, graph_edges, and embedding_meta. Useful before a " +
    "multi-model write to confirm what's available.",
  inputSchema: { type: "object", properties: {} },
  async execute(_input: unknown, _ctx): Promise<ToolResult<WorkspaceInfo>> {
    let db: ReturnType<typeof openDb>;
    try {
      db = openDb();
    } catch (err) {
      return {
        content: `db_workspace_info failed: ${(err as Error).message}`,
        isError: true,
      };
    }

    let vecVersion: string | null = null;
    try {
      vecVersion = (db.prepare("SELECT vec_version() AS v").get() as { v: string }).v;
    } catch {
      /* extension absent — leave null */
    }

    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type IN ('table','virtual') ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((r) => r.name);

    const counts: Record<string, number> = {};
    for (const t of [
      "messages",
      "graph_nodes",
      "graph_edges",
      "embedding_meta",
    ]) {
      try {
        counts[t] = (
          db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }
        ).c;
      } catch {
        counts[t] = -1;
      }
    }

    const dbPath = (db as unknown as { name: string }).name;
    const sqliteVersion = (
      db.prepare("SELECT sqlite_version() AS v").get() as { v: string }
    ).v;

    const data: WorkspaceInfo = {
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
