/**
 * Approval bus. Pluggable subscribers receive ApprovalRequests; the
 * first subscriber whose response is non-undefined wins. When no
 * subscriber responds, the bus defaults to deny-once (safe default).
 * An always-audited subscriber is attached automatically so every
 * decision is logged regardless of which UI handled it.
 */
import type { ApprovalBus } from '../kernel/types.js';
export interface ApprovalRequest {
    id: string;
    tool: string;
    summary: string;
    diff?: string;
    reason?: string;
}
export type ApprovalResponse = 'approve' | 'deny' | 'approve_once' | 'deny_always';
export type ApprovalSubscriber = (req: ApprovalRequest) => Promise<ApprovalResponse | undefined>;
export interface ConfigurableApprovalBus extends ApprovalBus {
    subscribe(subscriber: ApprovalSubscriber): () => void;
    setRequiresApprovalPredicate(fn: (toolName: string, input: unknown) => boolean): void;
    allowToolAlways(toolName: string): void;
    denyToolAlways(toolName: string): void;
}
export declare function createApprovalBus(options?: {
    alwaysApprove?: string[];
}): ConfigurableApprovalBus;
