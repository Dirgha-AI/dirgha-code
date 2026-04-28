/**
 * Ink-native approval bus.
 *
 * Replaces `tui/approval.ts`'s `createTuiApprovalBus`, which wrote the
 * approval prompt directly to `process.stdout` and read `process.stdin`
 * raw. Inside Ink that approach has two problems:
 *   1. Ink's differential renderer overdraws stdout writes — the user
 *      never sees the "Approve X? [y/n/a/d]" line.
 *   2. Stdin raw-mode handoff between Ink (owns it for `useInput`) and
 *      the approval reader hangs on Windows console; on Linux it sort
 *      of works but is fragile.
 *
 * This bus is purely in-memory: callers `await bus.request({...})` and
 * the React tree subscribes via `bus.subscribe()` to render an
 * `<ApprovalPrompt>` component. The user's `[y|n|a|d]` keypress goes
 * through `useInput` (no raw-mode contention); the component calls
 * `bus.resolve(id, decision)` to settle the awaited promise.
 *
 * `autoApproveTools` works the same as the legacy bus — names in this
 * set bypass the prompt entirely.
 */

import type { ApprovalBus } from '../../kernel/types.js';
import type { ApprovalDecision, ApprovalRequest } from './components/ApprovalPrompt.js';

type Listener = (req: ApprovalRequest | null) => void;

export interface InkApprovalBus extends ApprovalBus {
  /** Subscribe to incoming requests. Returns an unsubscribe fn. */
  subscribe(listener: Listener): () => void;
  /** Resolve a pending request from the UI side. */
  resolve(id: string, decision: ApprovalDecision): void;
  /** Add a tool name to the always-approve allowlist. */
  alwaysApprove(toolName: string): void;
  /** Mark deny-all so future requests resolve as deny without prompting. */
  denyAll(): void;
}

export function createInkApprovalBus(autoApprove: Set<string> = new Set()): InkApprovalBus {
  const resolvers = new Map<string, (d: ApprovalDecision) => void>();
  const listeners = new Set<Listener>();
  let denied = false;

  const emit = (req: ApprovalRequest | null): void => {
    for (const l of listeners) l(req);
  };

  return {
    requiresApproval(toolName: string): boolean {
      if (denied) return false; // denyAll short-circuits — kernel sees deny via request resolving deny
      return !autoApprove.has(toolName);
    },

    async request(req): Promise<ApprovalDecision> {
      // Honor deny-all without prompting.
      if (denied) return 'deny';
      // Defensive: if the tool was added to autoApprove between
      // requiresApproval and request, just approve.
      if (autoApprove.has(req.tool)) return 'approve';

      return new Promise<ApprovalDecision>((resolve) => {
        resolvers.set(req.id, (decision: ApprovalDecision) => {
          // Propagate side-effects of the decision before settling.
          if (decision === 'approve_once') autoApprove.add(req.tool);
          if (decision === 'deny_always') denied = true;
          resolve(decision);
        });
        emit(req);
      });
    },

    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    resolve(id: string, decision: ApprovalDecision): void {
      const resolver = resolvers.get(id);
      if (!resolver) return;
      resolvers.delete(id);
      // Clear the "active request" notification first so the UI can
      // unmount the prompt before firing the next one (if any).
      emit(null);
      resolver(decision);
    },

    alwaysApprove(toolName: string): void {
      autoApprove.add(toolName);
    },

    denyAll(): void {
      denied = true;
      // Settle any pending requests as 'deny'.
      for (const [id, resolver] of resolvers) {
        resolver('deny');
        resolvers.delete(id);
      }
      emit(null);
    },
  };
}
