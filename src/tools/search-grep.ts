/**
 * Code search using ripgrep when available, with a conservative fallback
 * to a Node-native line scan. Always returns file:line:match triples,
 * capped by resultLimit to keep the LLM reply compact.
 */

import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Tool } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";
import { isValidCwdPath } from "../utils/fs.js";

interface Input {
  pattern: string;
  path?: string;
  resultLimit?: number;
  ignoreCase?: boolean;
  filePattern?: string;
}

const DEFAULT_LIMIT = 200;

export const searchGrepTool: Tool = {
  name: "search_grep",
  description:
    "Search for a regex pattern across files under a directory. Prefers ripgrep when installed.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string" },
      resultLimit: { type: "integer", minimum: 1 },
      ignoreCase: { type: "boolean" },
      filePattern: {
        type: "string",
        description: "Glob to limit files (ripgrep --glob).",
      },
    },
    required: ["pattern"],
  },
  async execute(
    rawInput: unknown,
    ctx,
  ): Promise<
    ToolResult<{
      matches: number;
      truncated: boolean;
      engine: "ripgrep" | "node";
    }>
  > {
    const input = rawInput as Input;
    const check = isValidCwdPath(ctx.cwd, input.path ?? ".");
    if (!check.valid) return { content: check.error, isError: true };
    const root = check.resolved;
    const limit = input.resultLimit ?? DEFAULT_LIMIT;

    const rg = await runRipgrep(input, root, limit);
    if (rg) return rg;

    return nodeScan(input, root, limit);
  },
};

async function runRipgrep(
  input: Input,
  root: string,
  limit: number,
): Promise<
  | ToolResult<{
      matches: number;
      truncated: boolean;
      engine: "ripgrep" | "node";
    }>
  | undefined
> {
  const args = [
    "--line-number",
    "--no-heading",
    "--color",
    "never",
    `--max-count=${limit}`,
  ];
  if (input.ignoreCase) args.push("--ignore-case");
  if (input.filePattern) args.push("--glob", input.filePattern);
  args.push("--", input.pattern, root);

  const child = spawn("rg", args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out: string[] = [];
  const errChunks: Buffer[] = [];
  child.stdout.on("data", (buf: Buffer) => {
    out.push(buf.toString("utf8"));
  });
  child.stderr.on("data", (buf: Buffer) => {
    errChunks.push(buf);
  });

  const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
    child.on("error", (err) => rejectExit(err));
    child.on("exit", (code) => resolveExit(code ?? -1));
  }).catch(() => -1);

  const stderrText = Buffer.concat(errChunks as readonly Uint8Array[])
    .toString("utf8")
    .trim();

  if (exitCode === -1 || exitCode === 2) return undefined;

  const joined = out.join("");
  const lines =
    joined.length > 0 ? joined.split("\n").filter((l) => l.length > 0) : [];
  const truncated = lines.length >= limit;
  const content = lines.length > 0 ? lines.join("\n") : "(no matches)";
  return {
    content: stderrText ? `${content}\n\n[stderr]\n${stderrText}` : content,
    data: { matches: lines.length, truncated, engine: "ripgrep" },
    isError: false,
  };
}

async function nodeScan(
  input: Input,
  root: string,
  limit: number,
): Promise<
  ToolResult<{
    matches: number;
    truncated: boolean;
    engine: "ripgrep" | "node";
  }>
> {
  const flags = input.ignoreCase ? "gi" : "g";
  let regex: RegExp;
  try {
    regex = new RegExp(input.pattern, flags);
  } catch (err) {
    return { content: `Invalid regex: ${String(err)}`, isError: true };
  }

  const matches: string[] = [];
  let truncated = false;

  async function walk(dir: string): Promise<void> {
    if (matches.length >= limit) {
      truncated = true;
      return;
    }
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names) {
      if (name === "node_modules" || name === ".git" || name === "dist")
        continue;
      const abs = join(dir, name);
      const info = await stat(abs).catch(() => undefined);
      if (!info) continue;
      if (info.isDirectory()) await walk(abs);
      else if (info.isFile() && info.size < 512 * 1024) {
        const text = await readFile(abs, "utf8").catch(() => "");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          regex.lastIndex = 0; // reset state between tests — global-flag RegExp retains lastIndex
          if (regex.test(lines[i])) {
            matches.push(`${abs}:${i + 1}:${lines[i]}`);
            if (matches.length >= limit) {
              truncated = true;
              return;
            }
          }
        }
      }
    }
  }

  await walk(root);
  return {
    content: matches.length > 0 ? matches.join("\n") : "(no matches)",
    data: { matches: matches.length, truncated, engine: "node" },
    isError: false,
  };
}
