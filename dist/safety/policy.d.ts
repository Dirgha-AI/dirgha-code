/**
 * Policy engine. Evaluates a PermissionCheck against an ordered rule
 * list and returns a decision (allow / deny / require_approval). The
 * default ruleset ships in-code; user and project rules are merged at
 * config load time.
 */
import type { PermissionCheck, PermissionDecision } from "../tools/permission.js";
export interface PolicyRule {
    id: string;
    applies: {
        tools?: string[];
        actions?: PermissionCheck["action"][];
    };
    when?: PolicyCondition;
    effect: "allow" | "deny" | "require_approval";
    reason: string;
}
export interface PolicyCondition {
    pathMatches?: string;
    commandMatches?: string;
    outsideCwd?: boolean;
    startsWith?: string;
}
export interface PolicyEngineOptions {
    cwd: string;
    rules?: PolicyRule[];
}
export interface PolicyEngine {
    evaluate(req: PermissionCheck): PermissionDecision;
}
export declare const DEFAULT_RULES: PolicyRule[];
export declare function createPolicyEngine(opts: PolicyEngineOptions): PolicyEngine;
