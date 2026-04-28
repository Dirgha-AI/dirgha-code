/**
 * Append-only, hash-chained audit log. Every entry is a JSON object
 * carrying `prevHash` and `hash`; verify() walks the chain and detects
 * tampering.
 */
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
export function createAuditLog(opts = {}) {
    const dir = opts.directory ?? join(homedir(), '.dirgha', 'audit');
    let lastHash = 'GENESIS';
    return {
        async record(kind, payload, sessionId) {
            await ensure(dir);
            const entry = {
                id: randomUUID(),
                ts: new Date().toISOString(),
                sessionId,
                kind,
                payload,
                prevHash: lastHash,
                hash: '',
            };
            entry.hash = computeHash(lastHash, kind, entry.ts, sessionId, payload);
            lastHash = entry.hash;
            await appendFile(join(dir, fileFor()), `${JSON.stringify(entry)}\n`, 'utf8');
        },
        async read(date) {
            const path = join(dir, fileFor(date));
            const text = await readFile(path, 'utf8').catch(() => '');
            const out = [];
            for (const line of text.split('\n')) {
                if (!line.trim())
                    continue;
                try {
                    out.push(JSON.parse(line));
                }
                catch { /* skip */ }
            }
            return out;
        },
        async verify(date) {
            const entries = await this.read(date);
            let prev = 'GENESIS';
            for (const entry of entries) {
                const expected = computeHash(entry.prevHash, entry.kind, entry.ts, entry.sessionId, entry.payload);
                if (entry.prevHash !== prev || entry.hash !== expected) {
                    return { valid: false, brokenAt: entry.id };
                }
                prev = entry.hash;
            }
            lastHash = prev;
            return { valid: true };
        },
    };
}
function computeHash(prev, kind, ts, sessionId, payload) {
    const body = JSON.stringify({ prev, kind, ts, sessionId, payload });
    return createHash('sha256').update(body).digest('hex');
}
function fileFor(date) {
    const d = date ?? new Date().toISOString().slice(0, 10);
    return `${d}.ndjson`;
}
async function ensure(dir) {
    const info = await stat(dir).catch(() => undefined);
    if (!info)
        await mkdir(dir, { recursive: true });
}
//# sourceMappingURL=audit-log.js.map