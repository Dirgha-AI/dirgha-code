/**
 * qmd tool — semantic search over markdown document collections.
 *
 * Resolution order:
 *   1. Vendored binary at vendor/qmd/<platform>/qmd (built from Dirgha-AI/qmd fork)
 *   2. PATH binary `qmd` (user-installed @tobilu/qmd via Bun)
 *   3. null → return informative error
 *
 * The @tobilu/qmd package is TypeScript-source-only and requires Bun, so we
 * always use the CLI subprocess path — no dynamic JS import attempted.
 *
 * Build vendored binary: bun build --compile --target=bun-linux-x64 ./src/cli.ts --outfile vendor/qmd/linux-x64/qmd
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { access, constants } from "node:fs/promises";
import type { Tool } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";

const execFileAsync = promisify(execFile);

const _require = createRequire(import.meta.url);
const _pkgRoot = dirname(_require.resolve("../../package.json"));
const _platform = `${process.platform}-${process.arch}` as string;
const _vendoredQmdBin = join(
  _pkgRoot,
  "vendor",
  "qmd",
  _platform,
  process.platform === "win32" ? "qmd.exe" : "qmd",
);

async function resolveQmd(): Promise<string | null> {
  try {
    await access(_vendoredQmdBin, constants.X_OK);
    return _vendoredQmdBin;
  } catch { /* not vendored for this platform */ }
  try {
    await execFileAsync("which", ["qmd"], { timeout: 2000 });
    return "qmd";
  } catch {
    return null;
  }
}

export const qmdTool: Tool = {
  name: "qmd_search",
  description:
    "Semantic search over markdown document collections using qmd (Query Markdown Documents). " +
    "Performs hybrid keyword+vector search and returns ranked results with snippets. " +
    "Best for conceptual questions over docs, wikis, and long-lived markdown collections. " +
    "For source code search use search_grep instead.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query in natural language.",
      },
      collection: {
        type: "string",
        description:
          "Path to the markdown collection directory, or a named qmd collection. " +
          "Defaults to the agent cwd.",
      },
      n: {
        type: "number",
        description: "Number of results to return. Defaults to 5.",
      },
      json: {
        type: "boolean",
        description: "Return raw JSON results instead of formatted text. Defaults to false.",
      },
    },
    required: ["query"],
  },
  async execute(raw: unknown, ctx): Promise<ToolResult> {
    const input = raw as {
      query: string;
      collection?: string;
      n?: number;
      json?: boolean;
    };
    const n = input.n ?? 5;
    const collection = input.collection ?? (ctx as { cwd?: string })?.cwd ?? process.cwd();

    const qmdBin = await resolveQmd();
    if (!qmdBin) {
      return {
        content:
          "qmd is not available. Options:\n" +
          "  1. Vendored binary: build from github.com/Dirgha-AI/qmd and place at vendor/qmd/linux-x64/qmd\n" +
          "  2. Global install: npm install -g @tobilu/qmd (requires Bun: https://bun.sh)\n" +
          "Use search_grep as a fallback for keyword search.",
        isError: true,
      };
    }

    try {
      const args: string[] = ["query", input.query, "-n", String(n)];
      if (collection) args.push("-c", collection);
      if (input.json) args.push("--json");

      const { stdout, stderr } = await execFileAsync(qmdBin, args, {
        timeout: 30_000,
        maxBuffer: 1024 * 1024 * 2,
      });
      const out = stdout.trim();
      if (!out && stderr) {
        return { content: `qmd error: ${stderr.trim()}`, isError: true };
      }
      return { content: out || "No results.", isError: false };
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
      if (e.stdout !== undefined || e.stderr !== undefined) {
        const out = ((e.stdout ?? "") + (e.stderr ? `\n[stderr]\n${e.stderr}` : "")).trim();
        return { content: `exit ${e.code ?? 1}\n${out}`, isError: false };
      }
      return { content: `qmd search failed: ${e.message}`, isError: true };
    }
  },
};
