/**
 * Permission seam.
 *
 * L2 tools do not implement policy; they ask this seam whether a given
 * action on a given target is permitted in the current context. The
 * default engine here is permissive-with-approvals (writes, shell, and
 * outside-cwd access all require approval). The production engine is
 * injected from L6 (safety/policy.ts) which reads declarative rules.
 */
export interface PermissionCheck {
    tool: string;
    action: 'read' | 'write' | 'exec' | 'delete' | 'network';
    target: string;
}
export interface PermissionDecision {
    allowed: boolean;
    reason: string;
    requiresApproval: boolean;
}
export interface PermissionEngine {
    check(req: PermissionCheck): PermissionDecision;
}
export declare class DefaultPermissionEngine implements PermissionEngine {
    private readonly cwd;
    constructor(cwd: string);
    check(req: PermissionCheck): PermissionDecision;
}
