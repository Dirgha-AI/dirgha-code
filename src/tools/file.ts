/** tools/file.ts — File I/O tools: read, write, edit, patch, dir, delete */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { basename } from "node:path";
import { resolve, dirname, normalize, sep } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import type { ToolResult } from "../types.js";
import { fuzzyEditFileTool } from "./patch.js";
import {
  getCachedFile,
  setCachedFile,
  invalidateFileCache,
  recordWrite,
} from "../utils/session-cache.js";
import { isReadOnlyPath } from "../permission/judge.js";

// Workspace sandbox: restrict all file operations to this root
// Can be set via DIRGHA_WORKSPACE_ROOT env var or config
let _workspaceRoot: string | null = null;

export function setWorkspaceRoot(root: string): void {
  _workspaceRoot = resolve(root);
}

export function getWorkspaceRoot(): string {
  return _workspaceRoot ?? process.cwd();
}

// Resolve path within workspace sandbox
function sandboxPath(inputPath: string): string {
  const resolved = resolve(getWorkspaceRoot(), inputPath);
  const normalized = normalize(resolved);
  const root = getWorkspaceRoot();

  // Block absolute paths that try to escape workspace
  if (
    inputPath.startsWith(sep) ||
    (process.platform === "win32" && /^[a-z]:[/\\]/i.test(inputPath))
  ) {
    if (!normalized.startsWith(root + sep) && normalized !== root) {
      throw new Error(`Path '${inputPath}' escapes workspace root '${root}'`);
    }
  }

  // Block traversal attempts
  if (normalized.includes("..")) {
    throw new Error(`Path '${inputPath}' contains disallowed '..' traversal`);
  }

  // Ensure final path is within workspace
  if (!normalized.startsWith(root + sep) && normalized !== root) {
    throw new Error(`Path '${inputPath}' is outside workspace root '${root}'`);
  }

  return normalized;
}

const LOCKFILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "go.sum",
]);
const HEAD_LINES = 120;
const TAIL_LINES = 40;

function smartSlice(abs: string, raw: string): string {
  const name = basename(abs);
  const lines = raw.split("\n");
  const total = lines.length;

  // Lock files: show only metadata, skip the huge dependency tree
  if (LOCKFILES.has(name)) {
    const head = lines.slice(0, 20).join("\n");
    return `${head}\n\n[${name}: ${total} lines — dependency lock file, showing header only. Full content omitted to save context.]`;
  }

  // Large JSON: show top-level keys
  if ((name.endsWith(".json") || name.endsWith(".jsonc")) && total > 500) {
    try {
      const obj = JSON.parse(raw);
      const keys = Object.keys(obj);
      const preview = keys.slice(0, 20).map((k) => {
        const v = obj[k];
        const type = Array.isArray(v)
          ? `Array(${v.length})`
          : typeof v === "object" && v !== null
            ? `{${Object.keys(v).length} keys}`
            : JSON.stringify(v).slice(0, 60);
        return `  "${k}": ${type}`;
      });
      const more =
        keys.length > 20 ? `\n  ... ${keys.length - 20} more keys` : "";
      return `{\n${preview.join(",\n")}${more}\n}\n\n[${name}: ${total} lines — showing top-level keys only. Read specific path if you need values.]`;
    } catch {
      /* not valid JSON, fall through to line slicing */
    }
  }

  // Small files: number lines and return as-is (with hard char cap for huge single-line files)
  if (total <= HEAD_LINES + TAIL_LINES) {
    const out = lines.map((l, i) => `${i + 1}\t${l}`).join("\n");
    if (out.length > 50000) return out.slice(0, 50000) + "\n[truncated]";
    return out;
  }

  // Large files: head + omission notice + tail
  const head = lines
    .slice(0, HEAD_LINES)
    .map((l, i) => `${i + 1}\t${l}`)
    .join("\n");
  const tail = lines
    .slice(-TAIL_LINES)
    .map((l, i) => `${total - TAIL_LINES + i + 1}\t${l}`)
    .join("\n");
  const omitted = total - HEAD_LINES - TAIL_LINES;
  return `${head}\n\n[... ${omitted} lines omitted — use read_file with offset/limit if you need a specific section ...]\n\n${tail}`;
}

function guardWrite(abs: string): string | null {
  const match = isReadOnlyPath(abs);
  if (match)
    return `Path is read-only (matches: ${match}). Use a different path.`;
  return null;
}

export async function readFileTool(
  input: Record<string, any>,
): Promise<ToolResult> {
  try {
    const abs = sandboxPath(input["path"] as string);
    // Check session cache first (avoid redundant disk reads within a turn)
    const cached = getCachedFile(abs);
    if (cached !== undefined) {
      return {
        tool: "read_file",
        result:
          cached.length > 50000
            ? cached.slice(0, 50000) + "\n[truncated]"
            : cached,
      };
    }
    const buf = readFileSync(abs);
    // Detect binary files before reading as text
    try {
      const fileType = await fileTypeFromBuffer(buf);
      if (fileType) {
        // file-type only matches binary formats; if it detects a type, it's binary
        return {
          tool: "read_file",
          result: `[Binary file: ${fileType.ext} (${fileType.mime}, ${buf.length} bytes). Cannot display as text. Use appropriate tools to process this file type.]`,
        };
      }
    } catch {
      // file-type unavailable — fall through to UTF-8 read
    }
    const raw = buf.toString("utf8");
    const result = smartSlice(abs, raw);
    setCachedFile(abs, result);
    return { tool: "read_file", result };
  } catch (e) {
    return { tool: "read_file", result: "", error: (e as Error).message };
  }
}

export function writeFileTool(input: Record<string, any>): ToolResult {
  try {
    const abs = sandboxPath(input["path"] as string);
    const guard = guardWrite(abs);
    if (guard) return { tool: "write_file", result: "", error: guard };
    mkdirSync(dirname(abs), { recursive: true });
    const content = input["content"] as string;
    writeFileSync(abs, content, "utf8");
    invalidateFileCache(abs);
    recordWrite(abs);
    return {
      tool: "write_file",
      result: `Wrote ${Buffer.byteLength(content, "utf8")} bytes to ${abs}`,
    };
  } catch (e) {
    return { tool: "write_file", result: "", error: (e as Error).message };
  }
}

export function editFileTool(input: Record<string, any>): ToolResult {
  try {
    const abs = sandboxPath(input["path"] as string);
    const guard = guardWrite(abs);
    if (guard) return { tool: "edit_file", result: "", error: guard };
    const original = readFileSync(abs, "utf8");
    const oldStr = input["old_string"] as string;
    // Exact match first (fast path)
    if (original.includes(oldStr)) {
      writeFileSync(
        abs,
        original.replace(oldStr, input["new_string"] as string),
        "utf8",
      );
      invalidateFileCache(abs);
      recordWrite(abs);
      return { tool: "edit_file", result: `Replaced 1 occurrence in ${abs}` };
    }
    // Fall back to fuzzy matching
    const r = fuzzyEditFileTool(input);
    if (!r.error) invalidateFileCache(abs);
    return r;
  } catch (e) {
    return { tool: "edit_file", result: "", error: (e as Error).message };
  }
}

export function editFileAllTool(input: Record<string, any>): ToolResult {
  try {
    const abs = sandboxPath(input["path"] as string);
    const guard = guardWrite(abs);
    if (guard) return { tool: "edit_file_all", result: "", error: guard };
    const original = readFileSync(abs, "utf8");
    const oldStr = input["old_string"] as string;
    const count = original.split(oldStr).length - 1;
    if (count === 0)
      return {
        tool: "edit_file_all",
        result: "",
        error: "old_string not found in file",
      };
    writeFileSync(
      abs,
      original.split(oldStr).join(input["new_string"] as string),
      "utf8",
    );
    invalidateFileCache(abs);
    recordWrite(abs);
    return {
      tool: "edit_file_all",
      result: `Replaced ${count} occurrence(s) in ${abs}`,
    };
  } catch (e) {
    return { tool: "edit_file_all", result: "", error: (e as Error).message };
  }
}

export function applyPatchTool(input: Record<string, any>): ToolResult {
  try {
    const abs = sandboxPath(input["path"] as string);
    const patchFile = `${tmpdir()}/dirgha_patch_${Date.now()}.patch`;
    writeFileSync(patchFile, input["patch"] as string, "utf8");
    const result = spawnSync("patch", ["-p1", abs, patchFile], {
      encoding: "utf8",
      timeout: 10000,
    });
    if (result.status === 0)
      return { tool: "apply_patch", result: `Patch applied to ${abs}` };
    return {
      tool: "apply_patch",
      result: "",
      error: (result.stderr || result.stdout || "patch failed").trim(),
    };
  } catch (e) {
    return { tool: "apply_patch", result: "", error: (e as Error).message };
  }
}

export function makeDirTool(input: Record<string, any>): ToolResult {
  try {
    const abs = sandboxPath(input["path"] as string);
    mkdirSync(abs, { recursive: true });
    return { tool: "make_dir", result: `Created: ${abs}` };
  } catch (e) {
    return { tool: "make_dir", result: "", error: (e as Error).message };
  }
}

export function deleteFileTool(input: Record<string, any>): ToolResult {
  try {
    const abs = sandboxPath(input["path"] as string);
    if (statSync(abs).isDirectory())
      return { tool: "delete_file", result: "", error: "Path is a directory" };
    unlinkSync(abs);
    return { tool: "delete_file", result: `Deleted: ${abs}` };
  } catch (e) {
    return { tool: "delete_file", result: "", error: (e as Error).message };
  }
}
