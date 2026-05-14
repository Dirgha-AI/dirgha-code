/**
 * Helpers to convert legacy v1 tool results to the v2 ToolResult union.
 * v1 shape:  { content, isError, data?, metadata?, durationMs? }
 * v2 shape:  { ok, value | error, content, isError, metadata?, durationMs? }
 *
 * After wrapping, isError is computed as `!ok` so legacy consumers keep
 * working.
 */

import type { ToolResult, ToolError, ToolErrorKind } from '../kernel/types.js';

function buildOk<T>(
  content: string,
  value: T,
  opts: { metadata?: Record<string, unknown>; durationMs?: number } = {},
): ToolResult<T> {
  const out = {
    ok: true as const,
    isError: false as const,
    content,
    value,
    data: value,
  } as Extract<ToolResult<T>, { isError: false }>;
  if (opts.metadata !== undefined) out.metadata = opts.metadata;
  if (opts.durationMs !== undefined) out.durationMs = opts.durationMs;
  return out;
}

function buildError<T>(
  content: string,
  error: ToolError,
  opts: { metadata?: Record<string, unknown>; durationMs?: number; data?: unknown } = {},
): ToolResult<T> {
  const out = {
    ok: false,
    isError: true,
    content,
    error,
  } as Extract<ToolResult<T>, { isError: true }>;
  if (opts.metadata !== undefined) out.metadata = opts.metadata;
  if (opts.durationMs !== undefined) out.durationMs = opts.durationMs;
  if (opts.data !== undefined) out.data = opts.data;
  return out;
}

export function wrapLegacyResult<T = unknown>(
  raw: unknown,
  fallbackErrorKind: ToolErrorKind = 'external',
): ToolResult<T> {
  // null / undefined
  if (raw === null || raw === undefined) {
    return buildError<T>('', {
      kind: 'internal',
      message: 'tool returned null or undefined',
      retryable: false,
      fatal_to_loop: false,
    });
  }

  // bare string
  if (typeof raw === 'string') {
    return buildOk<T>(raw, undefined as unknown as T);
  }

  if (typeof raw !== 'object') {
    return buildError<T>(String(raw), {
      kind: 'internal',
      message: `tool returned non-object: ${typeof raw}`,
      retryable: false,
      fatal_to_loop: false,
    });
  }

  const obj = raw as Record<string, unknown>;
  const content = typeof obj.content === 'string' ? obj.content : '';
  const metadata = (obj.metadata && typeof obj.metadata === 'object')
    ? (obj.metadata as Record<string, unknown>)
    : undefined;
  const durationMs = typeof obj.durationMs === 'number' ? obj.durationMs : undefined;

  // already-v2 shape: pass through, but normalise isError = !ok.
  if ('ok' in obj && typeof obj.ok === 'boolean') {
    if (obj.ok) {
      return buildOk<T>(content, (obj.value ?? undefined) as T, { metadata, durationMs });
    } else {
      const errObj = (obj.error as Partial<ToolError> | undefined) ?? undefined;
      const error: ToolError = {
        kind: (errObj?.kind ?? fallbackErrorKind) as ToolErrorKind,
        message: errObj?.message ?? content ?? 'unknown error',
        retryable: errObj?.retryable ?? false,
        fatal_to_loop: errObj?.fatal_to_loop ?? false,
      };
      if (errObj?.cause !== undefined) error.cause = errObj.cause;
      return buildError<T>(content, error, { metadata, durationMs, data: obj.data });
    }
  }

  // Legacy v1 shape: { content, isError, data?, metadata?, durationMs? }
  const isError = obj.isError === true;
  if (isError) {
    return buildError<T>(content, {
      kind: fallbackErrorKind,
      message: content || 'unknown error',
      retryable: false,
      fatal_to_loop: false,
    }, { metadata, durationMs, data: obj.data });
  }

  return buildOk<T>(content, (obj.data ?? undefined) as T, { metadata, durationMs });
}

export function looksLikeV2Result(raw: unknown): boolean {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    'ok' in (raw as Record<string, unknown>) &&
    typeof (raw as Record<string, unknown>).ok === 'boolean'
  );
}

export function internalError<T = unknown>(
  kind: ToolErrorKind,
  message: string,
  content: string = message,
  opts: { retryable?: boolean; fatal_to_loop?: boolean; cause?: unknown } = {},
): ToolResult<T> {
  const error: ToolError = {
    kind,
    message,
    retryable: opts.retryable ?? false,
    fatal_to_loop: opts.fatal_to_loop ?? false,
  };
  if (opts.cause !== undefined) error.cause = opts.cause;
  return buildError<T>(content, error);
}

export function okResult<T = unknown>(
  content: string,
  value: T = undefined as T,
  opts: { metadata?: Record<string, unknown>; durationMs?: number } = {},
): ToolResult<T> {
  return buildOk<T>(content, value, opts);
}
