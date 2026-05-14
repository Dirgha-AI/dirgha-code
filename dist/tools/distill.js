/**
 * Tool output distillation. Tool results whose content exceeds the
 * configured budget are truncated to a head + tail with a marker line
 * describing the omitted middle. The FULL content is saved to disk
 * under ~/.dirgha/tool-outputs/{callId}.txt so the user can inspect
 * it after the fact.
 *
 * Distillation runs inside the executor AFTER wrapLegacyResult, so it
 * always operates on a canonical v2 ToolResult.
 *
 * Configuration is via env vars so we don't have to thread a config
 * object through the executor for now:
 *   DIRGHA_TOOL_DISTILL_MAX_CHARS   default 20000
 *   DIRGHA_TOOL_DISTILL_HEAD_CHARS  default 6000
 *   DIRGHA_TOOL_DISTILL_TAIL_CHARS  default 2000
 *   DIRGHA_TOOL_DISTILL_DISABLE     set to '1' to skip distillation entirely
 *   DIRGHA_TOOL_OUTPUTS_DIR         default ~/.dirgha/tool-outputs
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
function intEnv(name, fallback) {
    const v = process.env[name];
    if (!v)
        return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
function outputsDir() {
    return process.env.DIRGHA_TOOL_OUTPUTS_DIR ?? join(homedir(), '.dirgha', 'tool-outputs');
}
/**
 * Distill a tool result in place. Returns the same result object,
 * with content potentially truncated. The full content is saved
 * to disk on truncation.
 *
 * Skips distillation when DIRGHA_TOOL_DISTILL_DISABLE=1.
 */
export function distillToolResult(result, callId) {
    if (process.env.DIRGHA_TOOL_DISTILL_DISABLE === '1')
        return result;
    const maxChars = intEnv('DIRGHA_TOOL_DISTILL_MAX_CHARS', 20000);
    let headChars = intEnv('DIRGHA_TOOL_DISTILL_HEAD_CHARS', 6000);
    let tailChars = intEnv('DIRGHA_TOOL_DISTILL_TAIL_CHARS', 2000);
    const content = result.content;
    if (typeof content !== 'string' || content.length <= maxChars)
        return result;
    // Clamp head/tail to the maxChars budget so the distilled output is
    // never larger than maxChars. Preserve the head:tail ratio.
    if (headChars + tailChars > maxChars) {
        const ratio = headChars / (headChars + tailChars);
        headChars = Math.max(1, Math.floor(maxChars * ratio));
        tailChars = Math.max(1, maxChars - headChars);
    }
    // Save full content to disk for later inspection.
    let savedPath = null;
    try {
        const dir = outputsDir();
        mkdirSync(dir, { recursive: true });
        const id = callId ?? `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        savedPath = join(dir, `${sanitizeFilename(id)}.txt`);
        writeFileSync(savedPath, content, 'utf8');
    }
    catch {
        // best-effort: if we can't write, we still truncate but won't reference a path
        savedPath = null;
    }
    const head = content.slice(0, headChars);
    const tail = content.slice(content.length - tailChars);
    const omitted = content.length - headChars - tailChars;
    const marker = `\n\n[... ${omitted.toLocaleString()} chars truncated; full output ${savedPath ? `saved to ${savedPath}` : 'lost (disk write failed)'} ...]\n\n`;
    const newContent = `${head}${marker}${tail}`;
    // Mutate the content. Other fields (ok, value, error, metadata,
    // durationMs) are preserved unchanged.
    result.content = newContent;
    if (result.metadata === undefined) {
        result.metadata = {};
    }
    result.metadata.distilled = true;
    result.metadata.originalLength = content.length;
    if (savedPath)
        result.metadata.fullOutputPath = savedPath;
    return result;
}
function sanitizeFilename(s) {
    return s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}
//# sourceMappingURL=distill.js.map