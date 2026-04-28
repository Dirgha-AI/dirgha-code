/**
 * Unified diff helper used by fs-edit and the TUI's approval modal.
 *
 * Produces a line-oriented unified diff plus optional word-level inline
 * deltas for display. The algorithm is a straightforward longest-common-
 * subsequence walk; it is not minimised for very large files. Callers
 * should cap inputs at ~200 KB to keep latency interactive.
 */
export interface UnifiedDiffOptions {
    context?: number;
    fromLabel?: string;
    toLabel?: string;
}
export declare function unifiedDiff(before: string, after: string, opts?: UnifiedDiffOptions): string;
export declare function summariseDiff(diff: string): {
    added: number;
    removed: number;
};
