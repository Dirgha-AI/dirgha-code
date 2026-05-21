/**
 * String-replace edit with exact matching.
 *
 * When the exact string is missing, returns an error so the agent can
 * retry with more specific anchors. This is deterministic and
 * auditable — no "nearest fuzzy match" guessing.
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import type { Tool } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";
import { summariseDiff, unifiedDiff } from "./diff.js";
import { decodeLiteralUnicodeEscapes, isValidCwdPath } from "../utils/fs.js";

interface Input {
  path?: string;
  /** Alias for `path` — LSP tools use `filePath`; fs tools accept both. */
  filePath?: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

function resolvePath(raw: Record<string, unknown>): string {
  const filePath = typeof raw.filePath === "string" ? raw.filePath : undefined;
  const path = typeof raw.path === "string" ? raw.path : undefined;
  const resolved = path ?? filePath;
  if (!resolved) throw new Error("fs_edit requires 'path' or 'filePath'");
  return resolved;
}

export const fsEditTool: Tool = {
  name: "fs_edit",
  description:
    "Replace an exact substring in a file. Fails on ambiguity (multiple matches) unless replaceAll is set. Use larger context around oldString to disambiguate.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      filePath: { type: "string", description: "Alias for `path`." },
      oldString: { type: "string" },
      newString: { type: "string" },
      replaceAll: { type: "boolean" },
    },
    required: ["oldString", "newString"],
  },
  requiresApproval: () => true,
  async execute(
    rawInput: unknown,
    ctx,
  ): Promise<
    ToolResult<{ replacements: number; added: number; removed: number }>
  > {
    const input = rawInput as Input;
    const resolvedPath = resolvePath(rawInput as Record<string, unknown>);
    const check = isValidCwdPath(ctx.cwd, resolvedPath, { allowOutside: ctx.autoApprove === true && (ctx.sandboxMode === 'off' || ctx.sandboxMode == null) });
    if (!check.valid) return { content: check.error, isError: true };
    const abs = check.resolved;
    const info = await stat(abs).catch(() => undefined);
    if (!info || !info.isFile())
      return { content: `No such file: ${resolvedPath}`, isError: true };
    const before = await readFile(abs, "utf8");

    const oldString = decodeLiteralUnicodeEscapes(input.oldString);
    const newString = decodeLiteralUnicodeEscapes(input.newString);

    if (oldString === newString) {
      return {
        content: "oldString and newString are identical; nothing to do.",
        isError: true,
      };
    }

    const exactCount = countOccurrences(before, oldString);
    if (exactCount === 0) {
      return {
        content: `oldString not found in ${resolvedPath}. Provide more surrounding context or verify the file.`,
        isError: true,
      };
    }
    if (exactCount > 1 && !input.replaceAll) {
      return {
        content: `oldString matches ${exactCount} locations. Set replaceAll=true, or include more context to disambiguate.`,
        isError: true,
      };
    }

    const after = input.replaceAll
      ? splitJoin(before, oldString, newString)
      : before.replace(oldString, newString);

    const diff = unifiedDiff(before, after, {
      fromLabel: resolvedPath,
      toLabel: resolvedPath,
    });
    const { added, removed } = summariseDiff(diff);

    await writeFile(abs, after, "utf8");

    const summary = `Edited ${resolvedPath}: ${input.replaceAll ? exactCount : 1} replacement(s) (+${added} / -${removed})`;
    const content = diff ? `${summary}\n\n${diff}` : summary;

    return {
      content,
      data: { replacements: input.replaceAll ? exactCount : 1, added, removed },
      isError: false,
      metadata: {
        diff,
        added,
        removed,
        replacements: input.replaceAll ? exactCount : 1,
      },
    };
  },
};

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = 0;
  for (;;) {
    const found = haystack.indexOf(needle, idx);
    if (found < 0) break;
    count++;
    idx = found + needle.length;
  }
  return count;
}

function splitJoin(
  haystack: string,
  needle: string,
  replacement: string,
): string {
  return haystack.split(needle).join(replacement);
}
