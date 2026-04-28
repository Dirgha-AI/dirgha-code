/**
 * /memory — operate on the long-term memory store at ~/.dirgha/memory.
 * Subcommands: list, show <id>, add <id> <description>, remove <id>,
 * search <query>. Bodies for `add` come from the args after the
 * description and are stored as markdown.
 */

import { createMemoryStore, type MemoryType } from '../../context/memory.js';
import type { SlashCommand } from './types.js';

const VALID_TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

function usage(): string {
  return [
    'Usage:',
    '  /memory                                 List memories',
    '  /memory list                            Same as above',
    '  /memory show <id>                       Dump a single memory',
    '  /memory search <query>                  Full-text search',
    '  /memory add <id> <description>          Add a note (body = stdin later; for now, empty)',
    '  /memory remove <id>                     Delete a memory',
    '  /memory type <id> <type>                Set type (user|feedback|project|reference)',
  ].join('\n');
}

export const memoryCommand: SlashCommand = {
  name: 'memory',
  description: 'Inspect or edit long-term memory in ~/.dirgha/memory',
  async execute(args) {
    const store = createMemoryStore();
    const op = args[0] ?? 'list';

    if (op === 'list') {
      const all = await store.list();
      if (all.length === 0) return '(no memories yet — add one with `/memory add <id> <desc>`)';
      return all.map(m => `  ${m.id.padEnd(30)}  ${m.type.padEnd(10)}  ${m.name}`).join('\n');
    }

    if (op === 'show') {
      const id = args[1];
      if (!id) return `Missing id.\n${usage()}`;
      const entry = await store.get(id);
      if (!entry) return `Memory "${id}" not found.`;
      return [
        `# ${entry.name}`,
        `id:          ${entry.id}`,
        `type:        ${entry.type}`,
        `description: ${entry.description}`,
        `updatedAt:   ${entry.updatedAt}`,
        '',
        entry.body.trim() || '(empty body)',
      ].join('\n');
    }

    if (op === 'search') {
      const q = args.slice(1).join(' ');
      if (!q) return `Missing query.\n${usage()}`;
      const hits = await store.search(q);
      if (hits.length === 0) return `No memories match "${q}".`;
      return hits.map(m => `  ${m.id} — ${m.name}`).join('\n');
    }

    if (op === 'add') {
      const [, id, ...descParts] = args;
      if (!id) return `Missing id.\n${usage()}`;
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
      return `Added memory "${id}". Edit ~/.dirgha/memory/${id}.md to fill the body.`;
    }

    if (op === 'remove' || op === 'rm') {
      const id = args[1];
      if (!id) return `Missing id.\n${usage()}`;
      const existing = await store.get(id);
      if (!existing) return `Memory "${id}" not found.`;
      await store.remove(id);
      return `Removed "${id}".`;
    }

    if (op === 'type') {
      const [, id, typeArg] = args;
      if (!id || !typeArg) return `Missing args.\n${usage()}`;
      if (!VALID_TYPES.includes(typeArg as MemoryType)) {
        return `Type must be one of: ${VALID_TYPES.join(', ')}`;
      }
      const entry = await store.get(id);
      if (!entry) return `Memory "${id}" not found.`;
      await store.upsert({ ...entry, type: typeArg as MemoryType });
      return `Memory "${id}" now has type ${typeArg}.`;
    }

    return `Unknown subcommand "${op}".\n${usage()}`;
  },
};
