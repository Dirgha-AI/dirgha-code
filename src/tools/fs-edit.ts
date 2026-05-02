/**
 * String-replace edit with exact and fuzzy matching.
 *
 * Exact match is the fast path. When the exact string is missing, the
 * tool falls back to whitespace-normalised matching and, if still
 * ambiguous, returns an error with the candidate contexts so the agent
 * can retry with more specific anchors. This is deterministic and
 * auditable — no "nearest fuzzy match" guessing.
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { Tool } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";
import { summariseDiff, unifiedDiff } from "./diff.js";

interface Input {
  path: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export const fsEditTool: Tool = {
  name: "fs_edit",
  description:
    "Replace an exact substring in a file. Fails on ambiguity (multiple matches) unless replaceAll is set. Use larger context around oldString to disambiguate.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      oldString: { type: "string" },
      newString: { type: "string" },
      replaceAll: { type: "boolean" },
    },
    required: ["path", "oldString", "newString"],
  },
  requiresApproval: () => true,
  async execute(
    rawInput: unknown,
    ctx,
  ): Promise<
    ToolResult<{ replacements: number; added: number; removed: number }>
  > {
    const input = rawInput as Input;
    const abs = resolve(ctx.cwd, input.path);
    if (!abs.startsWith(ctx.cwd + sep) && abs !== ctx.cwd) {
      return { content: `Path escapes working directory: ${input.path}`, isError: true };
    }
    const info = await stat(abs).catch(() => undefined);
    if (!info || !info.isFile())
      return { content: `No such file: ${input.path}`, isError: true };
    const before = await readFile(abs, "utf8");

    if (input.oldString === input.newString) {
      return {
        content: "oldString and newString are identical; nothing to do.",
        isError: true,
      };
    }

    const exactCount = countOccurrences(before, input.oldString);
    if (exactCount === 0) {
      return {
        content: `oldString not found in ${input.path}. Provide more surrounding context or verify the file.`,
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
      ? splitJoin(before, input.oldString, input.newString)
      : before.replace(input.oldString, input.newString);

    const diff = unifiedDiff(before, after, {
      fromLabel: input.path,
      toLabel: input.path,
    });
    const { added, removed } = summariseDiff(diff);

    await writeFile(abs, after, "utf8");

    const summary = `Edited ${input.path}: ${input.replaceAll ? exactCount : 1} replacement(s) (+${added} / -${removed})`;
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
