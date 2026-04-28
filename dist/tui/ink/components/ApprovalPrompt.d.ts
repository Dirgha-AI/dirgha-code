/**
 * Inline tool-approval prompt — Ink-native.
 *
 * Replaces the legacy `createTuiApprovalBus` (in `tui/approval.ts`),
 * which wrote the approval question directly to `process.stdout` and
 * read `process.stdin` raw. That approach worked OK on Linux but on
 * Windows the raw-mode handoff between Ink and the approval reader
 * hung — and on every platform the prompt was invisible because Ink's
 * differential renderer overdrew it on the next frame.
 *
 * This component renders inside the React tree like `ModelSwitchPrompt`,
 * so it participates in normal Ink layout. Keys are read via `useInput`
 * (no raw-mode contention) and the answer is reported via `onResolve`.
 */
import * as React from 'react';
export type ApprovalDecision = 'approve' | 'deny' | 'approve_once' | 'deny_always';
export interface ApprovalRequest {
    id: string;
    tool: string;
    summary: string;
    diff?: string;
}
export interface ApprovalPromptProps {
    request: ApprovalRequest;
    onResolve: (decision: ApprovalDecision) => void;
}
export declare function ApprovalPrompt(props: ApprovalPromptProps): React.JSX.Element;
