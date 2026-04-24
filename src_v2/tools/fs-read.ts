/**
 * Read a file from disk with optional offset/limit windowing. Binary
 * files are rejected with a clear message; line-based windowing uses
 * cat -n style numbering so the model can cite line numbers reliably.
 */

import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Tool, ToolContext } from './registry.js';
import type { ToolResult } from '../kernel/types.js';

interface Input {
  path: string;
  offset?: number;
  limit?: number;
}

const MAX_BYTES = 2 * 1024 * 1024;

export const fsReadTool: Tool = {
  name: 'fs_read',
  description: 'Read a text file from disk. Returns contents with 1-based line numbers. Use offset/limit to page through large files.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute or cwd-relative path to the file.' },
      offset: { type: 'integer', minimum: 0, description: 'Line number to start from (0-based).' },
      limit: { type: 'integer', minimum: 1, description: 'Maximum number of lines to return.' },
    },
    required: ['path'],
  },
  async execute(rawInput: unknown, ctx): Promise<ToolResult<{ lines: number; truncated: boolean }>> {
    const input = rawInput as Input;
    const abs = resolve(ctx.cwd, input.path);
    const info = await stat(abs).catch(() => undefined);
    if (!info) return { content: `No such file: ${input.path}`, isError: true };
    if (!info.isFile()) return { content: `Not a file: ${input.path}`, isError: true };
    if (info.size > MAX_BYTES) {
      return { content: `File too large (${info.size} bytes, max ${MAX_BYTES}). Use offset/limit.`, isError: true };
    }

    const buffer = await readFile(abs);
    if (isBinary(buffer)) return { content: `File appears to be binary: ${input.path}`, isError: true };

    const text = buffer.toString('utf8');
    const lines = text.split('\n');
    const offset = input.offset ?? 0;
    const limit = input.limit ?? lines.length;
    const window = lines.slice(offset, offset + limit);
    const numbered = window
      .map((line, idx) => `${String(offset + idx + 1).padStart(6)}\t${line}`)
      .join('\n');
    const truncated = offset + window.length < lines.length;

    return {
      content: numbered,
      data: { lines: window.length, truncated },
      isError: false,
      metadata: { totalLines: lines.length, offset, limit },
    };
  },
};

function isBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  return false;
}
