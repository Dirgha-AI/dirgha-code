/**
 * Agent team templates — pre-configured workflows.
 * Ported from monorepo agent/orchestration/templates.ts.
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
