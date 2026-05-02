/**
 * rtk tool — token-cheap shell command execution.
 *
 * Wraps shell commands through the `rtk` binary, which filters and
 * compresses stdout to strip noise (progress bars, ANSI, verbose boilerplate).
 * Falls back to direct execution when rtk is not installed so the tool
 * is always usable regardless of host environment.
 *
 * Install rtk: https://github.com/rtk-ai/rtk
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { access, constants } from "node:fs/promises";
import type { Tool, ToolContext } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";

const execFileAsync = promisify(execFile);

// Resolve the package root: require.resolve returns the absolute path to
// package.json, so one dirname gives us the package root directory.
const _require = createRequire(import.meta.url);
const _pkgRoot = dirname(_require.resolve("../../package.json"));

// Platform key used to locate the vendored binary.
const _platform = `${process.platform}-${process.arch}` as string;

// Vendored binary path: vendor/rtk/<platform>/rtk (or rtk.exe on Windows).
const _vendoredBin = join(
  _pkgRoot,
  "vendor",
  "rtk",
  _platform,
  process.platform === "win32" ? "rtk.exe" : "rtk",
);

// Resolve which rtk binary to use: vendored → PATH → null.
async function resolveRtk(): Promise<string | null> {
  // 1. Prefer the vendored binary shipped inside the package.
  try {
    await access(_vendoredBin, constants.X_OK);
    return _vendoredBin;
  } catch { /* not present for this platform */ }
  // 2. Fall back to whatever rtk is on PATH.
  try {
    await execFileAsync("which", ["rtk"], { timeout: 2000 });
    return "rtk";
  } catch {
    return null;
  }
}

export const rtkTool: Tool = {
  name: "rtk",
  description:
    "Run a shell command through rtk (Rust Token Killer) for token-compressed output. " +
    "rtk strips noise (ANSI codes, progress bars, verbose boilerplate) from command output, " +
    "making it much cheaper to process in context. Use this instead of `shell` for read-only " +
    "commands like git status, cargo test output, ls, find, grep, etc. " +
    "Falls back to direct execution when rtk is not installed. " +
    "Install: https://github.com/rtk-ai/rtk",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description:
          "The shell command to run (e.g. 'git status', 'cargo test', 'ls -la'). " +
          "Do NOT include 'rtk' prefix — it is added automatically.",
      },
      cwd: {
        type: "string",
        description:
          "Working directory for the command. Defaults to the agent's cwd.",
      },
      timeoutMs: {
        type: "number",
        description: "Timeout in milliseconds. Defaults to 30000.",
      },
    },
    required: ["command"],
  },
  async execute(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = raw as { command: string; cwd?: string; timeoutMs?: number };
    const workDir = input.cwd ?? ctx.cwd ?? process.cwd();
    const timeout = input.timeoutMs ?? 30_000;
    const cmdParts = input.command.trim().split(/\s+/);

    try {
      const rtkBin = await resolveRtk();
      const argv = rtkBin ? [rtkBin, ...cmdParts] : cmdParts;
      const bin = argv[0];
      const args = argv.slice(1);
      const rtkUsed = rtkBin !== null;

      const { stdout, stderr } = await execFileAsync(bin, args, {
        cwd: workDir,
        timeout,
        maxBuffer: 1024 * 1024 * 4,
        // Disable rtk's default telemetry. rtk pings telemetry.rtk-ai.app
        // with aggregate command counts; Dirgha users have not opted in.
        env: { ...process.env, RTK_TELEMETRY_DISABLED: "1" },
      });

      const out = (stdout + (stderr ? `\n[stderr]\n${stderr}` : "")).trim();
      return {
        content: out || "(no output)",
        data: { command: input.command, rtkUsed, cwd: workDir },
        isError: false,
      };
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
        code?: number;
      };
      // Non-zero exit: return output + exit code, not a hard error (let model decide).
      if (e.stdout !== undefined || e.stderr !== undefined) {
        const out = (
          (e.stdout ?? "") + (e.stderr ? `\n[stderr]\n${e.stderr}` : "")
        ).trim();
        return {
          content: `exit ${e.code ?? 1}\n${out}`,
          data: { exitCode: e.code ?? 1, command: input.command },
          isError: false,
        };
      }
      return {
        content: `rtk tool failed: ${e.message}`,
        isError: true,
      };
    }
  },
};
