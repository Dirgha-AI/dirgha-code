/**
 * Write a file to disk, creating parent directories as needed.
 * Returns a unified diff summary so the approval UI can preview the
 * change. Refuses to silently overwrite: the description declares the
 * overwrite contract.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Tool } from './registry.js';
import type { ToolResult } from '../kernel/types.js';
import { summariseDiff, unifiedDiff } from './diff.js';

/** Decode literal \uXXXX escape sequences a model may have emitted as text. */
function decodeLiteralUnicodeEscapes(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
    const cp = parseInt(hex, 16);
    // Only decode printable ASCII range (0x20–0x7E) plus common whitespace.
    // Leave high-codepoint escapes (e.g. CJK, emoji) as-is to avoid
    // corrupting intentional unicode-escape strings in JS source.
    if ((cp >= 0x20 && cp <= 0x7e) || cp === 0x0a || cp === 0x0d || cp === 0x09) {
      return String.fromCodePoint(cp);
    }
    return _;
  });
}

interface Input {
  path: string;
  content: string;
  createDirs?: boolean;
}

export const fsWriteTool: Tool = {
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
  async execute(rawInput: unknown, ctx): Promise<ToolResult<{ bytesWritten: number; added: number; removed: number }>> {
    const input = rawInput as Input;
    const abs = resolve(ctx.cwd, input.path);
    if (!abs.startsWith(ctx.cwd + sep) && abs !== ctx.cwd) {
      return { content: `Path escapes working directory: ${input.path}`, isError: true };
    }
    let before = '';
    const existed = await stat(abs).then(() => true).catch(() => false);
    if (existed) before = await readFile(abs, 'utf8');
    else if (input.createDirs) await mkdir(dirname(abs), { recursive: true });

    const sanitized = decodeLiteralUnicodeEscapes(input.content);
    const diff = unifiedDiff(before, sanitized, { fromLabel: input.path, toLabel: input.path });
    const { added, removed } = summariseDiff(diff);

    await writeFile(abs, sanitized, 'utf8');

    const summary = existed
      ? `Updated ${input.path} (+${added} / -${removed})`
      : `Created ${input.path} (${sanitized.length} bytes)`;

    return {
      content: summary,
      data: { bytesWritten: Buffer.byteLength(sanitized, 'utf8'), added, removed },
      isError: false,
      metadata: { diff },
    };
  },
};
