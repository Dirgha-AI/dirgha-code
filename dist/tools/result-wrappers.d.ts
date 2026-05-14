/**
 * Helpers to convert legacy v1 tool results to the v2 ToolResult union.
 * v1 shape:  { content, isError, data?, metadata?, durationMs? }
 * v2 shape:  { ok, value | error, content, isError, metadata?, durationMs? }
 *
 * After wrapping, isError is computed as `!ok` so legacy consumers keep
 * working.
 */
import type { ToolResult, ToolErrorKind } from '../kernel/types.js';
export declare function wrapLegacyResult<T = unknown>(raw: unknown, fallbackErrorKind?: ToolErrorKind): ToolResult<T>;
export declare function looksLikeV2Result(raw: unknown): boolean;
export declare function internalError<T = unknown>(kind: ToolErrorKind, message: string, content?: string, opts?: {
    retryable?: boolean;
    fatal_to_loop?: boolean;
    cause?: unknown;
}): ToolResult<T>;
export declare function okResult<T = unknown>(content: string, value?: T, opts?: {
    metadata?: Record<string, unknown>;
    durationMs?: number;
}): ToolResult<T>;
