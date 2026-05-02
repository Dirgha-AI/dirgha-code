/**
 * fleet/scratchpad.ts — Shared inter-agent scratchpad for parallel fleet runs.
 *
 * Append-only JSONL file under <repoRoot>/.fleet/.scratchpad/<goalSlug>.jsonl
 * File-lock via O_CREAT|O_EXCL on a .lock sidecar to avoid concurrent write
 * corruption. Reads are lock-free (OS-level append atomicity on ext4/APFS for
 * writes under 4096 bytes).
 */
export interface ScratchpadEntry {
    ts: string;
    agentId: string;
    kind: "note" | "file_found" | "hypothesis" | "result";
    text: string;
    tags?: string[];
}
export interface ScratchpadHandle {
    goalSlug: string;
    path: string;
    lockPath: string;
}
export declare function openScratchpad(repoRoot: string, goalSlug: string): Promise<ScratchpadHandle>;
export declare function appendNote(handle: ScratchpadHandle, agentId: string, kind: ScratchpadEntry["kind"], text: string, tags?: string[]): Promise<void>;
export declare function readNotes(handle: ScratchpadHandle, opts?: {
    agentId?: string;
    kind?: ScratchpadEntry["kind"];
    limit?: number;
}): Promise<ScratchpadEntry[]>;
export declare function formatNotes(entries: ScratchpadEntry[]): string;
