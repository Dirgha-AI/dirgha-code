/**
 * Daemon JSON-RPC protocol. Method + param types are declared here so
 * the server and any future client share a single source of truth.
 */
import type { AgentEvent, Message, UsageTotal } from '../kernel/types.js';
export interface DaemonRequest<TParams = unknown> {
    jsonrpc: '2.0';
    id: number | string;
    method: string;
    params?: TParams;
}
export interface DaemonResponse<TResult = unknown> {
    jsonrpc: '2.0';
    id: number | string;
    result?: TResult;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}
export interface DaemonNotification<TParams = unknown> {
    jsonrpc: '2.0';
    method: string;
    params?: TParams;
}
export type DaemonWire = DaemonRequest | DaemonResponse | DaemonNotification;
export interface SessionStartParams {
    model?: string;
    system?: string;
}
export interface SessionStartResult {
    sessionId: string;
    model: string;
}
export interface SessionResumeParams {
    sessionId: string;
}
export interface SessionResumeResult {
    sessionId: string;
    turns: number;
}
export interface PromptSubmitParams {
    sessionId: string;
    prompt: string;
}
export interface PromptSubmitResult {
    streamId: string;
}
export interface ApprovalRespondParams {
    requestId: string;
    decision: 'approve' | 'deny' | 'approve_once' | 'deny_always';
}
export interface EventNotification {
    streamId: string;
    event: AgentEvent;
}
export interface HealthResult {
    uptimeMs: number;
    sessionsActive: number;
    usage: UsageTotal;
}
export interface SessionListResult {
    sessions: Array<{
        id: string;
        createdAt: string;
        turns: number;
    }>;
}
export interface SessionMessagesResult {
    sessionId: string;
    messages: Message[];
}
