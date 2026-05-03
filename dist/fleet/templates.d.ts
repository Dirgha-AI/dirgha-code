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
export declare const TEAM_TEMPLATES: TeamTemplate[];
export declare function getTemplate(name: string): TeamTemplate | undefined;
export declare function listTemplateNames(): string[];
