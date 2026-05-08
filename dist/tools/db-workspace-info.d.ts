/**
 * db_workspace_info tool — agent-facing introspection of the per-session
 * SQLite workspace (Sprint 7 — docs/cli/index/agent-db.md).
 *
 * Returns DB path, schema tables, vec extension status, row counts.
 * The agent calls this before a multi-model write so it knows what's
 * actually wired up before the transactional_write tool fires.
 */
import type { Tool } from "./registry.js";
export declare const dbWorkspaceInfoTool: Tool;
