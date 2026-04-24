/**
 * `dirgha import-session <path>` — load a session JSON into the store.
 *
 * Accepts both the native export format (`{ id, entries, messages }`
 * from `dirgha export-session`) and a bare array of messages (legacy
 * v1 exports). Writes a fresh session file under
 * `~/.dirgha/sessions/<new-uuid>.jsonl` and prints the new id so the
 * caller can `/session load <id>` from the REPL.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { stdout, stderr } from 'node:process';
import { createSessionStore } from '../../context/session.js';
import { style, defaultTheme } from '../../tui/theme.js';
function isEntry(value) {
    return !!value && typeof value === 'object' && typeof value.type === 'string';
}
function parse(raw) {
    if (Array.isArray(raw)) {
        // Legacy: bare message array.
        const entries = [];
        const ts = new Date().toISOString();
        for (const message of raw) {
            if (message && typeof message === 'object' && 'role' in message && 'content' in message) {
                entries.push({ type: 'message', ts, message });
            }
        }
        return { entries };
    }
    const obj = raw;
    if (Array.isArray(obj.entries) && obj.entries.every(isEntry)) {
        return { entries: obj.entries };
    }
    if (Array.isArray(obj.messages)) {
        const ts = new Date().toISOString();
        const entries = obj.messages.map(m => ({ type: 'message', ts, message: m }));
        return { entries };
    }
    return { entries: [] };
}
export const importSessionSubcommand = {
    name: 'import-session',
    aliases: ['import'],
    description: 'Load a session JSON file into ~/.dirgha/sessions',
    async run(argv, ctx) {
        const pathArg = argv[0];
        if (!pathArg) {
            stderr.write('usage: dirgha import-session <path>\n');
            return 1;
        }
        const path = resolve(ctx.cwd, pathArg);
        let raw;
        try {
            const text = await readFile(path, 'utf8');
            raw = JSON.parse(text);
        }
        catch (err) {
            stderr.write(`cannot read ${path}: ${err instanceof Error ? err.message : String(err)}\n`);
            return 1;
        }
        const { entries } = parse(raw);
        if (entries.length === 0) {
            stderr.write('no entries found — expected { id?, entries|messages } or a bare message array\n');
            return 1;
        }
        const store = createSessionStore();
        const newId = randomUUID();
        const session = await store.create(newId);
        for (const entry of entries)
            await session.append(entry);
        stdout.write(`${style(defaultTheme.success, '✓')} imported ${entries.length} entries as session ${newId}\n`);
        stdout.write(`  resume in REPL: /session load ${newId}\n`);
        return 0;
    },
};
//# sourceMappingURL=import-session.js.map