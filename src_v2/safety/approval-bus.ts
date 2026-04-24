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

export function createApprovalBus(options: { alwaysApprove?: string[] } = {}): ConfigurableApprovalBus {
  const subscribers = new Set<ApprovalSubscriber>();
  const approve = new Set(options.alwaysApprove ?? []);
  const deny = new Set<string>();
  let requiresApproval = (toolName: string, _input: unknown): boolean => !approve.has(toolName) && !deny.has(toolName);

  const bus: ConfigurableApprovalBus = {
    requiresApproval(toolName, _input): boolean {
      if (deny.has(toolName)) return true;
      if (approve.has(toolName)) return false;
      return requiresApproval(toolName, _input);
    },
    async request(req) {
      if (deny.has(req.tool)) return 'deny_always';
      if (approve.has(req.tool)) return 'approve_once';
      for (const sub of subscribers) {
        const response = await sub(req);
        if (response !== undefined) {
          if (response === 'deny_always') deny.add(req.tool);
          if (response === 'approve_once') approve.add(req.tool);
          return response;
        }
      }
      return 'deny';
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => { subscribers.delete(subscriber); };
    },
    setRequiresApprovalPredicate(fn) { requiresApproval = fn; },
    allowToolAlways(toolName) { approve.add(toolName); deny.delete(toolName); },
    denyToolAlways(toolName) { deny.add(toolName); approve.delete(toolName); },
  };

  return bus;
}
