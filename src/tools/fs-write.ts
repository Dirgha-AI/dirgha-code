/**
 * Write a file to disk, creating parent directories as needed.
 * Returns a unified diff summary so the approval UI can preview the
 * change. Refuses to silently overwrite: the description declares the
 * overwrite contract.
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Tool } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";
import { summariseDiff, unifiedDiff } from "./diff.js";
import { decodeLiteralUnicodeEscapes, isValidCwdPath } from "../utils/fs.js";

interface Input {
  path?: string;
  /** Alias for `path` — LSP tools use `filePath`; fs tools accept both. */
  filePath?: string;
  content: string;
  createDirs?: boolean;
}

function resolvePath(raw: Record<string, unknown>): string {
  const filePath = typeof raw.filePath === "string" ? raw.filePath : undefined;
  const path = typeof raw.path === "string" ? raw.path : undefined;
  const resolved = path ?? filePath;
  if (!resolved) throw new Error("fs_write requires 'path' or 'filePath'");
  return resolved;
}

export const fsWriteTool: Tool = {
  name: "fs_write",
  description:
    "Write content to a file. Creates parent directories when createDirs is true. Overwrites existing files.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      filePath: { type: "string", description: "Alias for `path`." },
      content: { type: "string" },
      createDirs: {
        type: "boolean",
        description: "Create parent directories if they do not exist.",
      },
    },
    required: ["content"],
  },
  requiresApproval: () => true,
  async execute(
    rawInput: unknown,
    ctx,
  ): Promise<
    ToolResult<{ bytesWritten: number; added: number; removed: number }>
  > {
    const input = rawInput as Input;
    const resolvedPath = resolvePath(rawInput as Record<string, unknown>);
    const check = isValidCwdPath(ctx.cwd, resolvedPath, { allowOutside: ctx.autoApprove === true && (ctx.sandboxMode === 'off' || ctx.sandboxMode == null) });
    if (!check.valid) return { content: check.error, isError: true };
    const abs = check.resolved;
    let before = "";
    const existed = await stat(abs)
      .then(() => true)
      .catch(() => false);
    if (existed) before = await readFile(abs, "utf8");
    else if (input.createDirs) await mkdir(dirname(abs), { recursive: true });

    const sanitized = decodeLiteralUnicodeEscapes(input.content);
    const diff = unifiedDiff(before, sanitized, {
      fromLabel: resolvedPath,
      toLabel: resolvedPath,
    });
    const { added, removed } = summariseDiff(diff);

    await writeFile(abs, sanitized, "utf8");

    const summary = existed
      ? `Updated ${resolvedPath} (+${added} / -${removed})`
      : `Created ${resolvedPath} (${sanitized.length} bytes)`;

    return {
      content: summary,
      data: {
        bytesWritten: Buffer.byteLength(sanitized, "utf8"),
        added,
        removed,
      },
      isError: false,
      metadata: { diff },
    };
  },
};
