/**
 * fleet/types.ts — Shared types for parallel-agent Fleet runtime (v2).
 *
 * A Fleet is a bounded set of parallel subagents, each running the v2
 * agent-loop inside its own isolated git worktree. The parent observes
 * all of them through a single EventStream and receives a FleetResult
 * summarising every agent's outcome.
 *
 * Vocabulary (carried over from v1):
 *   - worktree  — filesystem isolation (git worktree)
 *   - fleet     — a set of parallel agents pursuing one goal
 *   - subtask   — one independent stream inside a fleet
 *   - shot      — a single stylistic variant in a tripleshot
 */
/** Default tool allowlists by AgentType. */
export const AGENT_TYPE_TOOLS = {
    explore: ['fs_read', 'fs_ls', 'search_grep', 'search_glob', 'git'],
    plan: ['fs_read', 'fs_ls', 'search_grep', 'search_glob'],
    verify: ['fs_read', 'fs_ls', 'search_grep', 'search_glob', 'shell', 'git'],
    code: ['fs_read', 'fs_write', 'fs_edit', 'fs_ls', 'search_grep', 'search_glob', 'shell', 'git'],
    research: ['fs_read', 'fs_ls', 'search_grep', 'search_glob'],
    custom: [],
};
//# sourceMappingURL=types.js.map