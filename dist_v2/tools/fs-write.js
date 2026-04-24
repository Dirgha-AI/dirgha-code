/**
 * Write a file to disk, creating parent directories as needed.
 * Returns a unified diff summary so the approval UI can preview the
 * change. Refuses to silently overwrite: the description declares the
 * overwrite contract.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { summariseDiff, unifiedDiff } from './diff.js';
export const fsWriteTool = {
    name: 'fs_write',
    description: 'Write content to a file. Creates parent directories when createDirs is true. Overwrites existing files.',
    inputSchema: {
        type: 'object',
        properties: {
            path: { type: 'string' },
            content: { type: 'string' },
            createDirs: { type: 'boolean', description: 'Create parent directories if they do not exist.' },
        },
        required: ['path', 'content'],
    },
    requiresApproval: () => true,
    async execute(rawInput, ctx) {
        const input = rawInput;
        const abs = resolve(ctx.cwd, input.path);
        let before = '';
        const existed = await stat(abs).then(() => true).catch(() => false);
        if (existed)
            before = await readFile(abs, 'utf8');
        else if (input.createDirs)
            await mkdir(dirname(abs), { recursive: true });
        const diff = unifiedDiff(before, input.content, { fromLabel: input.path, toLabel: input.path });
        const { added, removed } = summariseDiff(diff);
        await writeFile(abs, input.content, 'utf8');
        const summary = existed
            ? `Updated ${input.path} (+${added} / -${removed})`
            : `Created ${input.path} (${input.content.length} bytes)`;
        return {
            content: summary,
            data: { bytesWritten: Buffer.byteLength(input.content, 'utf8'), added, removed },
            isError: false,
            metadata: { diff },
        };
    },
};
//# sourceMappingURL=fs-write.js.map