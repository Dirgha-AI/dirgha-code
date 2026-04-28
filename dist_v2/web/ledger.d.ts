export type LedgerEntryKind = 'goal' | 'decision' | 'observation' | 'experiment' | 'metric' | 'note' | 'compaction';
export interface LedgerEntry {
    ts: string;
    kind: LedgerEntryKind;
    text: string;
    metadata?: Record<string, unknown>;
}
export interface ScopeSummary {
    scope: string;
    entryCount: number;
    byKind: Partial<Record<LedgerEntryKind, number>>;
    earliestTs?: string;
    latestTs?: string;
    recent: LedgerEntry[];
    digestExcerpt?: string;
}
export interface LedgerSummary {
    scopes: ScopeSummary[];
    totalEntries: number;
    scopeCount: number;
}
export declare function collectLedger(opts?: {
    ledgerDir?: string;
}): Promise<LedgerSummary>;
export declare function renderLedgerPage(summary: LedgerSummary): string;
