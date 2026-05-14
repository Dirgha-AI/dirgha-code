/**
 * Helpers to convert legacy v1 tool results to the v2 ToolResult union.
 * v1 shape:  { content, isError, data?, metadata?, durationMs? }
 * v2 shape:  { ok, value | error, content, isError, metadata?, durationMs? }
 *
 * After wrapping, isError is computed as `!ok` so legacy consumers keep
 * working.
 */
function buildOk(content, value, opts = {}) {
    const out = {
        ok: true,
        isError: false,
        content,
        value,
    };
    if (opts.metadata !== undefined)
        out.metadata = opts.metadata;
    if (opts.durationMs !== undefined)
        out.durationMs = opts.durationMs;
    return out;
}
function buildError(content, error, opts = {}) {
    const out = {
        ok: false,
        isError: true,
        content,
        error,
    };
    if (opts.metadata !== undefined)
        out.metadata = opts.metadata;
    if (opts.durationMs !== undefined)
        out.durationMs = opts.durationMs;
    if (opts.data !== undefined)
        out.data = opts.data;
    return out;
}
export function wrapLegacyResult(raw, fallbackErrorKind = 'external') {
    // null / undefined
    if (raw === null || raw === undefined) {
        return buildError('', {
            kind: 'internal',
            message: 'tool returned null or undefined',
            retryable: false,
            fatal_to_loop: false,
        });
    }
    // bare string
    if (typeof raw === 'string') {
        return buildOk(raw, undefined);
    }
    if (typeof raw !== 'object') {
        return buildError(String(raw), {
            kind: 'internal',
            message: `tool returned non-object: ${typeof raw}`,
            retryable: false,
            fatal_to_loop: false,
        });
    }
    const obj = raw;
    const content = typeof obj.content === 'string' ? obj.content : '';
    const metadata = (obj.metadata && typeof obj.metadata === 'object')
        ? obj.metadata
        : undefined;
    const durationMs = typeof obj.durationMs === 'number' ? obj.durationMs : undefined;
    // already-v2 shape: pass through, but normalise isError = !ok.
    if ('ok' in obj && typeof obj.ok === 'boolean') {
        if (obj.ok) {
            return buildOk(content, (obj.value ?? undefined), { metadata, durationMs });
        }
        else {
            const errObj = obj.error ?? undefined;
            const error = {
                kind: (errObj?.kind ?? fallbackErrorKind),
                message: errObj?.message ?? content ?? 'unknown error',
                retryable: errObj?.retryable ?? false,
                fatal_to_loop: errObj?.fatal_to_loop ?? false,
            };
            if (errObj?.cause !== undefined)
                error.cause = errObj.cause;
            return buildError(content, error, { metadata, durationMs, data: obj.data });
        }
    }
    // Legacy v1 shape: { content, isError, data?, metadata?, durationMs? }
    const isError = obj.isError === true;
    if (isError) {
        return buildError(content, {
            kind: fallbackErrorKind,
            message: content || 'unknown error',
            retryable: false,
            fatal_to_loop: false,
        }, { metadata, durationMs, data: obj.data });
    }
    return buildOk(content, (obj.data ?? undefined), { metadata, durationMs });
}
export function looksLikeV2Result(raw) {
    return (typeof raw === 'object' &&
        raw !== null &&
        'ok' in raw &&
        typeof raw.ok === 'boolean');
}
export function internalError(kind, message, content = message, opts = {}) {
    const error = {
        kind,
        message,
        retryable: opts.retryable ?? false,
        fatal_to_loop: opts.fatal_to_loop ?? false,
    };
    if (opts.cause !== undefined)
        error.cause = opts.cause;
    return buildError(content, error);
}
export function okResult(content, value = undefined, opts = {}) {
    return buildOk(content, value, opts);
}
//# sourceMappingURL=result-wrappers.js.map