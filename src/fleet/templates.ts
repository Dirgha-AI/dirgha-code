/**
 * Agent team templates — pre-configured workflows.
 * Ported from monorepo agent/orchestration/templates.ts.
 *
 * Pass a template name via FleetConfig.template (or --template <name> on
 * the CLI) to skip the LLM decomposer and use a fixed agent team instead.
 * runFleet() calls expandTemplate() → getTemplate() → FleetSubtask[].
 */
export interface TeamTemplate {
  name: string;
  description: string;
  agents: AgentSlot[];
  coordination: "sequential" | "parallel" | "voting";
}

export interface AgentSlot {
  type: "explore" | "plan" | "code" | "verify" | "research";
  count: number;
  tools: string[];
}

export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    name: "bugfix",
    description: "Investigate, fix, and verify a bug",
    coordination: "sequential",
    agents: [
      {
        type: "research",
        count: 1,
        tools: ["fs_read", "search_grep", "search_glob", "git", "web_fetch"],
      },
      {
        type: "code",
        count: 1,
        tools: ["fs_read", "fs_write", "fs_edit", "shell"],
      },
      { type: "verify", count: 1, tools: ["fs_read", "shell", "search_grep"] },
    ],
  },
  {
    name: "refactor",
    description: "Research codebase and refactor in parallel",
    coordination: "parallel",
    agents: [
      {
        type: "research",
        count: 1,
        tools: ["fs_read", "search_grep", "search_glob", "git"],
      },
      {
        type: "code",
        count: 2,
        tools: ["fs_read", "fs_write", "fs_edit", "shell"],
      },
    ],
  },
  {
    name: "research",
    description: "Deep research using multiple agents in parallel",
    coordination: "parallel",
    agents: [
      {
        type: "research",
        count: 2,
        tools: ["fs_read", "search_grep", "search_glob", "web_fetch", "git"],
      },
    ],
  },
  {
    name: "review",
    description: "Review code and verify correctness",
    coordination: "sequential",
    agents: [
      {
        type: "code",
        count: 1,
        tools: ["fs_read", "search_grep", "search_glob"],
      },
      { type: "verify", count: 1, tools: ["fs_read", "shell", "search_grep"] },
    ],
  },
  {
    name: "implement",
    description: "Implement a feature with parallel coding agents",
    coordination: "parallel",
    agents: [
      {
        type: "code",
        count: 2,
        tools: ["fs_read", "fs_write", "fs_edit", "shell"],
      },
    ],
  },
  {
    name: "triple-shot",
    description: "Plan → implement → refine in three passes",
    coordination: "sequential",
    agents: [
      {
        type: "plan",
        count: 1,
        tools: ["fs_read", "search_grep", "search_glob"],
      },
      {
        type: "code",
        count: 1,
        tools: ["fs_read", "fs_write", "fs_edit", "shell"],
      },
      {
        type: "verify",
        count: 1,
        tools: ["fs_read", "shell", "search_grep", "fs_edit"],
      },
    ],
  },
];

export function getTemplate(name: string): TeamTemplate | undefined {
  return TEAM_TEMPLATES.find((t) => t.name === name);
}

export function listTemplateNames(): string[] {
  return TEAM_TEMPLATES.map((t) => t.name);
}
