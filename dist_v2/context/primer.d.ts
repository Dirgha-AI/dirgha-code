/**
 * Project primer loader.
 *
 * At boot, walk up from cwd looking for DIRGHA.md (or CLAUDE.md as a
 * compat fallback). The first one found becomes the project primer
 * stitched into the system prompt. Capped at PRIMER_CAP_BYTES so an
 * accidentally-huge file doesn't blow the model's context.
 *
 * The loader is intentionally synchronous-ish (one stat per parent
 * dir, capped at a small depth). Callers wire its output into
 * `applyMode(systemPrompt, mode)` so the boot context is:
 *
 *   ┌─ mode preamble (PLAN / ACT / VERIFY)
 *   ├─ project primer (DIRGHA.md, capped)
 *   └─ caller-supplied --system text (rare)
 */
export interface PrimerResult {
    primer: string;
    source: string | null;
    truncated: boolean;
}
/**
 * Walk up from `startDir` looking for a primer file. Returns the
 * first match, capped to PRIMER_CAP_BYTES. Returns an empty primer
 * with source=null when nothing is found.
 */
export declare function loadProjectPrimer(startDir: string): PrimerResult;
/**
 * Compose the full boot system prompt. Order:
 *
 *   1. soul          — who dirgha is and how it should behave
 *   2. modePreamble  — act/plan/verify/ask gates
 *   3. project primer — DIRGHA.md / CLAUDE.md
 *   4. gitState      — workspace snapshot (interactive only)
 *   5. userSystem    — caller-supplied --system flag (escape hatch)
 *
 * Empty sections drop out — no leading/trailing blank lines.
 */
export declare function composeSystemPrompt(parts: {
    soul?: string;
    modePreamble: string;
    primer?: string;
    gitState?: string;
    userSystem?: string | undefined;
}): string;
