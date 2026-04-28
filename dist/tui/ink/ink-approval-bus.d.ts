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
export declare function createInkApprovalBus(autoApprove?: Set<string>): InkApprovalBus;
export {};
