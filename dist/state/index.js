/**
 * Unified state index. Maintains ~/.dirgha/state-index.json that
 * cross-references sessions, checkpoints, and cron jobs by session ID.
 * All writes are atomic (write to tmp, rename).
 */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const STATE_DIR = join(homedir(), '.dirgha');
const INDEX_PATH = join(STATE_DIR, 'state-index.json');
async function readIndex() {
    try {
        const raw = await readFile(INDEX_PATH, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return { version: 1, sessions: {} };
    }
}
async function writeIndex(index) {
    await mkdir(STATE_DIR, { recursive: true });
    // Write to a tmp file in the SAME directory as INDEX_PATH so that the
    // subsequent rename(2) is within one filesystem. Writing to os.tmpdir()
    // would cause an EXDEV error on Linux when /tmp is a tmpfs while ~/.dirgha
    // is on the root filesystem.
    const tmp = join(STATE_DIR, `.dirgha-state-${randomUUID()}.tmp`);
    await writeFile(tmp, JSON.stringify(index, null, 2), 'utf8');
    await rename(tmp, INDEX_PATH);
}
export async function renameSession(sessionId, title) {
    try {
        const index = await readIndex();
        if (!index.sessions[sessionId])
            return false;
        index.sessions[sessionId].title = title;
        await writeIndex(index);
        return true;
    }
    catch {
        return false;
    }
}
export async function registerSession(sessionId, model) {
    try {
        const index = await readIndex();
        if (!index.sessions[sessionId]) {
            index.sessions[sessionId] = {
                sessionId,
                startedAt: new Date().toISOString(),
                model,
                checkpointIds: [],
                cronJobIds: [],
            };
            await writeIndex(index);
        }
    }
    catch {
        // Never throw — state index is best-effort
    }
}
export async function registerCheckpoint(sessionId, checkpointId) {
    try {
        const index = await readIndex();
        if (!index.sessions[sessionId]) {
            index.sessions[sessionId] = {
                sessionId,
                startedAt: new Date().toISOString(),
                checkpointIds: [],
                cronJobIds: [],
            };
        }
        if (!index.sessions[sessionId].checkpointIds.includes(checkpointId)) {
            index.sessions[sessionId].checkpointIds.push(checkpointId);
            await writeIndex(index);
        }
    }
    catch {
        // Never throw — state index is best-effort
    }
}
export async function registerCronJob(sessionId, jobId) {
    if (!sessionId)
        return;
    try {
        const index = await readIndex();
        if (!index.sessions[sessionId]) {
            index.sessions[sessionId] = {
                sessionId,
                startedAt: new Date().toISOString(),
                checkpointIds: [],
                cronJobIds: [],
            };
        }
        if (!index.sessions[sessionId].cronJobIds.includes(jobId)) {
            index.sessions[sessionId].cronJobIds.push(jobId);
            await writeIndex(index);
        }
    }
    catch {
        // Never throw — state index is best-effort
    }
}
export async function closeSession(sessionId) {
    try {
        const index = await readIndex();
        if (index.sessions[sessionId]) {
            index.sessions[sessionId].endedAt = new Date().toISOString();
            await writeIndex(index);
        }
    }
    catch {
        // Never throw — state index is best-effort
    }
}
export async function querySession(sessionId) {
    try {
        const index = await readIndex();
        return index.sessions[sessionId] ?? null;
    }
    catch {
        return null;
    }
}
export async function listSessions(limit = 20) {
    try {
        const index = await readIndex();
        return Object.values(index.sessions)
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            .slice(0, limit);
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=index.js.map