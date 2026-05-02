/**
 * fleet/scratchpad.ts — Shared inter-agent scratchpad for parallel fleet runs.
 *
 * Append-only JSONL file under <repoRoot>/.fleet/.scratchpad/<goalSlug>.jsonl
 * File-lock via O_CREAT|O_EXCL on a .lock sidecar to avoid concurrent write
 * corruption. Reads are lock-free (OS-level append atomicity on ext4/APFS for
 * writes under 4096 bytes).
 */
import { appendFile, mkdir, open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
const LOCK_RETRY_INTERVAL_MS = 50;
const LOCK_MAX_RETRIES = 20; // 1 second total
export async function openScratchpad(repoRoot, goalSlug) {
    const dir = join(repoRoot, ".fleet", ".scratchpad");
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${goalSlug}.jsonl`);
    const lockPath = path + ".lock";
    return { goalSlug, path, lockPath };
}
export async function appendNote(handle, agentId, kind, text, tags) {
    const entry = {
        ts: new Date().toISOString(),
        agentId,
        kind,
        text: text.slice(0, 2000),
        ...(tags?.length ? { tags } : {}),
    };
    const line = JSON.stringify(entry) + "\n";
    await withLock(handle.lockPath, () => appendFile(handle.path, line, "utf8"));
}
export async function readNotes(handle, opts) {
    let raw;
    try {
        raw = await readFile(handle.path, "utf8");
    }
    catch {
        return [];
    }
    const entries = raw
        .split("\n")
        .filter(Boolean)
        .map((line) => {
        try {
            return JSON.parse(line);
        }
        catch {
            return null;
        }
    })
        .filter((e) => e !== null);
    let filtered = entries;
    if (opts?.agentId)
        filtered = filtered.filter((e) => e.agentId === opts.agentId);
    if (opts?.kind)
        filtered = filtered.filter((e) => e.kind === opts.kind);
    if (opts?.limit)
        filtered = filtered.slice(-opts.limit);
    return filtered;
}
export function formatNotes(entries) {
    if (!entries.length)
        return "(no scratchpad notes yet)";
    return entries
        .map((e) => `[${e.ts.slice(11, 19)} ${e.agentId}/${e.kind}] ${e.text}`)
        .join("\n");
}
async function withLock(lockPath, fn) {
    let fh;
    for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
        try {
            fh = await open(lockPath, "wx"); // O_CREAT | O_EXCL — fails if exists
            break;
        }
        catch {
            await new Promise((r) => setTimeout(r, LOCK_RETRY_INTERVAL_MS));
        }
    }
    if (!fh) {
        // Timed out — write anyway rather than silently dropping the note.
        return fn();
    }
    try {
        return await fn();
    }
    finally {
        await fh.close().catch(() => { });
        try {
            await rm(lockPath, { force: true });
        }
        catch { }
    }
}
//# sourceMappingURL=scratchpad.js.map