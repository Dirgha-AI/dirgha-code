/**
 * Directory listing, one level deep. Emits a terse `kind name [size]`
 * table so the model has a clear picture of directory contents without
 * spending tokens on noisy metadata.
 */
import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
// Paths where a blind fs_ls is almost never what the user actually
// wanted. Typing `fs_ls .` at / or /root spills 100+ unrelated entries
// into the model's context for no gain. Force a narrower ask.
const HUGE_ROOTS = new Set(['/', '/root', '/home', '/tmp', '/Users', '/var']);
export const fsLsTool = {
    name: 'fs_ls',
    description: 'List the entries of a directory, one level deep.',
    inputSchema: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Directory to list. Defaults to cwd.' },
            includeHidden: { type: 'boolean', description: 'Include dotfiles.' },
        },
    },
    async execute(rawInput, ctx) {
        const input = rawInput;
        const target = resolve(ctx.cwd, input.path ?? '.');
        if (HUGE_ROOTS.has(target)) {
            return {
                content: `Refusing to list ${target} — too broad. Supply a narrower path, or use search_glob / search_grep with a targeted pattern.`,
                isError: true,
            };
        }
        const info = await stat(target).catch(() => undefined);
        if (!info || !info.isDirectory())
            return { content: `Not a directory: ${input.path ?? '.'}`, isError: true };
        const names = await readdir(target);
        const visible = input.includeHidden ? names : names.filter(n => !n.startsWith('.'));
        visible.sort();
        const rows = [];
        for (const name of visible) {
            const child = resolve(target, name);
            const s = await stat(child).catch(() => undefined);
            if (!s)
                continue;
            if (s.isDirectory())
                rows.push(`dir   ${name}/`);
            else if (s.isFile())
                rows.push(`file  ${name}\t${s.size}`);
            else
                rows.push(`other ${name}`);
        }
        return {
            content: rows.length > 0 ? rows.join('\n') : '(empty directory)',
            data: { entries: rows.length },
            isError: false,
        };
    },
};
//# sourceMappingURL=fs-ls.js.map