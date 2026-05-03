/**
 * File discovery by glob pattern. Honours .gitignore-style directory
 * skips (node_modules, .git, dist by default). Returns matching paths
 * relative to the search root, sorted for determinism.
 */

import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Tool } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";
import { isValidCwdPath } from "../utils/fs.js";

interface Input {
  pattern: string;
  path?: string;
  resultLimit?: number;
  maxDepth?: number;
}

const DEFAULT_LIMIT = 500;
const DEFAULT_MAX_DEPTH = 64;
const DEFAULT_SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
]);

export const searchGlobTool: Tool = {
  name: "search_glob",
  description:
    'Find files by glob pattern (e.g., "**/*.ts"). Skips node_modules, .git, dist by default.',
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string" },
      resultLimit: { type: "integer", minimum: 1 },
      maxDepth: {
        type: "integer",
        minimum: 1,
        description: "Maximum recursion depth. Default 64.",
      },
    },
    required: ["pattern"],
  },
  async execute(
    rawInput: unknown,
    ctx,
  ): Promise<ToolResult<{ files: number; truncated: boolean }>> {
    const input = rawInput as Input;
    const check = isValidCwdPath(ctx.cwd, input.path ?? ".");
    if (!check.valid) return { content: check.error, isError: true };
    const root = check.resolved;
    const limit = input.resultLimit ?? DEFAULT_LIMIT;
    const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH;
    const matcher = globToRegex(input.pattern);
    const files: string[] = [];
    let truncated = false;

    async function walk(dir: string, depth: number): Promise<void> {
      if (depth > maxDepth || files.length >= limit) {
        truncated = true;
        return;
      }
      const names = await readdir(dir).catch(() => [] as string[]);
      for (const name of names) {
        if (DEFAULT_SKIP.has(name)) continue;
        const abs = join(dir, name);
        const info = await stat(abs).catch(() => undefined);
        if (!info) continue;
        if (info.isDirectory()) await walk(abs, depth + 1);
        else if (info.isFile()) {
          const rel = relative(root, abs);
          if (matcher.test(rel)) {
            files.push(rel);
            if (files.length >= limit) {
              truncated = true;
              return;
            }
          }
        }
      }
    }

    await walk(root, 0);
    files.sort();
    return {
      content: files.length > 0 ? files.join("\n") : "(no matches)",
      data: { files: files.length, truncated },
      isError: false,
    };
  },
};

function globToRegex(pattern: string): RegExp {
  let rx = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        rx += ".*";
        i += 2;
        if (pattern[i] === "/") i++;
      } else {
        rx += "[^/]*";
        i++;
      }
    } else if (ch === "?") {
      rx += "[^/]";
      i++;
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      rx += `\\${ch}`;
      i++;
    } else {
      rx += ch;
      i++;
    }
  }
  rx += "$";
  return new RegExp(rx);
}
