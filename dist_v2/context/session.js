/**
 * Append-only session log, persisted as JSONL. Crash-safe: every append
 * is a single fs.appendFile call; partial last lines on replay are
 * ignored silently. A session is identified by its id; the canonical
 * file path derives from the id plus the store's base directory.
 */
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createReadStream } from 'node:fs';
export class SessionStore {
    dir;
    constructor(dir = join(homedir(), '.dirgha', 'sessions')) {
        this.dir = dir;
    }
    async create(id) {
        await this.ensure();
        const path = join(this.dir, `${id}.jsonl`);
        const exists = await stat(path).then(() => true).catch(() => false);
        if (!exists)
            await writeFile(path, '', 'utf8');
        return new SessionImpl(id, path);
    }
    async open(id) {
        const path = join(this.dir, `${id}.jsonl`);
        const exists = await stat(path).then(() => true).catch(() => false);
        if (!exists)
            return undefined;
        return new SessionImpl(id, path);
    }
    async list() {
        await this.ensure();
        const { readdir } = await import('node:fs/promises');
        const names = await readdir(this.dir).catch(() => []);
        return names.filter(n => n.endsWith('.jsonl')).map(n => n.replace(/\.jsonl$/, ''));
    }
    async ensure() {
        const info = await stat(this.dir).catch(() => undefined);
        if (!info)
            await mkdir(this.dir, { recursive: true });
    }
}
class SessionImpl {
    id;
    path;
    constructor(id, path) {
        this.id = id;
        this.path = path;
    }
    async append(entry) {
        await appendFile(this.path, `${JSON.stringify(entry)}\n`, 'utf8');
    }
    async *replay() {
        const content = await readFile(this.path, 'utf8').catch(() => '');
        for (const line of content.split('\n')) {
            if (!line.trim())
                continue;
            try {
                yield JSON.parse(line);
            }
            catch {
                continue;
            }
        }
    }
    async messages() {
        const out = [];
        for await (const entry of this.replay()) {
            if (entry.type === 'message')
                out.push(entry.message);
        }
        return out;
    }
}
export function createSessionStore(opts = {}) {
    return new SessionStore(opts.directory);
}
export async function streamJsonl(path, onLine) {
    return new Promise((resolve, reject) => {
        const stream = createReadStream(path, { encoding: 'utf8' });
        let buffer = '';
        stream.on('data', (chunk) => {
            buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            let idx;
            while ((idx = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 1);
                if (!line.trim())
                    continue;
                try {
                    onLine(JSON.parse(line));
                }
                catch { /* skip */ }
            }
        });
        stream.on('end', () => {
            if (buffer.trim()) {
                try {
                    onLine(JSON.parse(buffer));
                }
                catch { /* skip */ }
            }
            resolve();
        });
        stream.on('error', reject);
    });
}
//# sourceMappingURL=session.js.map