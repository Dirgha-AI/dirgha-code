/**
 * `dirgha memory <list|show|search|add|remove|type>` — long-term memory
 * store at `~/.dirgha/memory/`.
 *
 * Mirrors the `/memory` slash but callable non-interactively from
 * shells and scripts. The slash version is in `cli/slash/memory.ts`;
 * both go through `context/memory.ts` so behavior is identical.
 */
import { stdout, stderr } from 'node:process';
import { createMemoryStore } from '../../context/memory.js';
import { style, defaultTheme } from '../../tui/theme.js';
const VALID_TYPES = ['user', 'feedback', 'project', 'reference'];
const HELP = [
    'Usage:',
    '  dirgha memory                          List memories',
    '  dirgha memory list                     Same as above',
    '  dirgha memory show <id>                Dump a single memory',
    '  dirgha memory search <query>           Full-text search',
    '  dirgha memory add <id> <description>   Add a note',
    '  dirgha memory remove <id>              Delete a memory',
    '  dirgha memory type <id> <type>         Set type (user|feedback|project|reference)',
].join('\n');
export const memorySubcommand = {
    name: 'memory',
    description: 'Inspect or edit long-term memory',
    async run(argv) {
        const store = createMemoryStore();
        const op = argv[0] ?? 'list';
        if (op === 'help' || op === '-h' || op === '--help') {
            stdout.write(HELP + '\n');
            return 0;
        }
        if (op === 'list') {
            const all = await store.list();
            if (all.length === 0) {
                stdout.write(style(defaultTheme.muted, '(no memories yet — add one with `dirgha memory add <id> <desc>`)\n'));
                return 0;
            }
            stdout.write(style(defaultTheme.accent, '\nDirgha memory\n\n'));
            for (const m of all) {
                stdout.write(`  ${m.id.padEnd(36)}  ${style(defaultTheme.muted, m.type.padEnd(10))}  ${m.name}\n`);
            }
            stdout.write('\n');
            stdout.write(style(defaultTheme.muted, `  ${all.length} memories at ~/.dirgha/memory\n`));
            return 0;
        }
        if (op === 'show') {
            const id = argv[1];
            if (!id) {
                stderr.write(`Missing id.\n${HELP}\n`);
                return 2;
            }
            const entry = await store.get(id);
            if (!entry) {
                stderr.write(`Memory "${id}" not found.\n`);
                return 1;
            }
            stdout.write(`# ${entry.name}\n`);
            stdout.write(`id:          ${entry.id}\n`);
            stdout.write(`type:        ${entry.type}\n`);
            stdout.write(`description: ${entry.description}\n`);
            stdout.write(`updatedAt:   ${entry.updatedAt}\n\n`);
            stdout.write(entry.body.trim() || '(empty body)');
            stdout.write('\n');
            return 0;
        }
        if (op === 'search') {
            const q = argv.slice(1).join(' ');
            if (!q) {
                stderr.write(`Missing query.\n${HELP}\n`);
                return 2;
            }
            const hits = await store.search(q);
            if (hits.length === 0) {
                stdout.write(`No memories match "${q}".\n`);
                return 0;
            }
            for (const m of hits)
                stdout.write(`  ${m.id} — ${m.name}\n`);
            return 0;
        }
        if (op === 'add') {
            const [, id, ...descParts] = argv;
            if (!id) {
                stderr.write(`Missing id.\n${HELP}\n`);
                return 2;
            }
            const now = new Date().toISOString();
            await store.upsert({
                id,
                type: 'user',
                name: id,
                description: descParts.join(' ') || '(no description)',
                body: '',
                createdAt: now,
                updatedAt: now,
            });
            stdout.write(style(defaultTheme.success, `✓ added memory "${id}"\n`));
            stdout.write(style(defaultTheme.muted, `  edit ~/.dirgha/memory/${id}.md to fill the body\n`));
            return 0;
        }
        if (op === 'remove' || op === 'rm') {
            const id = argv[1];
            if (!id) {
                stderr.write(`Missing id.\n${HELP}\n`);
                return 2;
            }
            const existing = await store.get(id);
            if (!existing) {
                stderr.write(`Memory "${id}" not found.\n`);
                return 1;
            }
            await store.remove(id);
            stdout.write(style(defaultTheme.success, `✓ removed "${id}"\n`));
            return 0;
        }
        if (op === 'type') {
            const [, id, typeArg] = argv;
            if (!id || !typeArg) {
                stderr.write(`Missing args.\n${HELP}\n`);
                return 2;
            }
            if (!VALID_TYPES.includes(typeArg)) {
                stderr.write(`Type must be one of: ${VALID_TYPES.join(', ')}\n`);
                return 2;
            }
            const entry = await store.get(id);
            if (!entry) {
                stderr.write(`Memory "${id}" not found.\n`);
                return 1;
            }
            await store.upsert({ ...entry, type: typeArg });
            stdout.write(style(defaultTheme.success, `✓ "${id}" now has type ${typeArg}\n`));
            return 0;
        }
        stderr.write(`Unknown subcommand "${op}".\n${HELP}\n`);
        return 2;
    },
};
//# sourceMappingURL=memory.js.map