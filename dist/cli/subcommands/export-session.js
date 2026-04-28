/**
 * `dirgha export-session <id> [path]` — dump a session to a JSON file.
 *
 * Reads the JSONL log for `<id>` from `~/.dirgha/sessions/`, reassembles
 * it into a single JSON document with `{ id, entries, messages }`, and
 * writes it to `path`. A path of `-` streams to stdout. The export is
 * lossless enough that `dirgha import-session` can round-trip it.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stdout, stderr } from 'node:process';
import { createSessionStore } from '../../context/session.js';
import { style, defaultTheme } from '../../tui/theme.js';
export const exportSessionSubcommand = {
    name: 'export-session',
    aliases: ['export'],
    description: 'Dump a session JSONL to a JSON file (or stdout via -)',
    async run(argv, ctx) {
        const [id, pathArg] = argv;
        if (!id) {
            stderr.write('usage: dirgha export-session <id> [path|-]\n');
            return 1;
        }
        const store = createSessionStore();
        const session = await store.open(id);
        if (!session) {
            stderr.write(`session "${id}" not found\n`);
            return 1;
        }
        const entries = [];
        const messages = [];
        for await (const entry of session.replay()) {
            entries.push(entry);
            if (entry.type === 'message')
                messages.push(entry.message);
        }
        const payload = {
            id,
            exportedAt: new Date().toISOString(),
            entries,
            messages,
        };
        const serialized = JSON.stringify(payload, null, 2) + '\n';
        if (!pathArg || pathArg === '-') {
            stdout.write(serialized);
            return 0;
        }
        const outPath = resolve(ctx.cwd, pathArg);
        try {
            await writeFile(outPath, serialized, 'utf8');
            stdout.write(`${style(defaultTheme.success, '✓')} wrote ${outPath} (${entries.length} entries, ${messages.length} messages)\n`);
            return 0;
        }
        catch (err) {
            stderr.write(`failed to write ${outPath}: ${err instanceof Error ? err.message : String(err)}\n`);
            return 1;
        }
    },
};
//# sourceMappingURL=export-session.js.map