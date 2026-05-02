/**
 * Shell command execution.
 *
 * Runs through a sandbox adapter when one is configured; otherwise
 * spawns a child process with inherited env. Output is captured with a
 * byte cap; on overflow we truncate and indicate the remaining size so
 * the model does not misread a capped stream as a complete one.
 *
 * Platform routing (1.13.0):
 *   posix → spawn(cmd, { shell: true })  // /bin/sh -c <cmd>
 *   win32 → prefer pwsh > powershell > cmd.exe via env detection;
 *           fall back to cmd if PowerShell isn't on PATH. PowerShell
 *           handles quoting + UTF-8 + multi-line scripts more cleanly
 *           than cmd.exe's relic Windows-95 parser.
 */

import { spawn, spawnSync } from "node:child_process";
import type { Tool } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";

interface Input {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

/** Cached PowerShell executable detection (per-process, never re-probed). */
let cachedWindowsShell: {
  cmd: string;
  args: (script: string) => string[];
} | null = null;

function resolveWindowsShell(): {
  cmd: string;
  args: (script: string) => string[];
} {
  if (cachedWindowsShell) return cachedWindowsShell;
  // Prefer PowerShell 7+ (`pwsh`), then Windows PowerShell 5.1, then cmd.
  for (const exe of ["pwsh", "powershell"]) {
    const probe = spawnSync(exe, ["-NoLogo", "-Command", "exit 0"], {
      timeout: 3000,
    });
    if (probe.status === 0) {
      cachedWindowsShell = {
        cmd: exe,
        args: (script: string): string[] => [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-OutputFormat",
          "Text",
          "-Command",
          script,
        ],
      };
      return cachedWindowsShell;
    }
  }
  // Fallback: cmd.exe via shell:true (no /c needed since spawn handles it).
  cachedWindowsShell = {
    cmd: process.env.ComSpec ?? "cmd.exe",
    args: (script: string): string[] => ["/d", "/s", "/c", script],
  };
  return cachedWindowsShell;
}

interface Output {
  exitCode: number;
  stdoutBytes: number;
  stderrBytes: number;
  truncated: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

export const shellTool: Tool = {
  name: "shell",
  description:
    process.platform === "win32"
      ? "Execute a shell command via PowerShell (or cmd.exe fallback). Returns stdout, stderr, and exit code. The host is Windows: prefer PowerShell-style commands (Get-ChildItem, Where-Object, Select-String) over POSIX (ls, grep). For maximum portability use cross-platform tools (node, npm, git, python). Long-running commands time out."
      : "Execute a shell command via /bin/sh. Returns stdout, stderr, and exit code. Long-running commands time out.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string" },
      cwd: { type: "string" },
      timeoutMs: { type: "integer", minimum: 1000 },
    },
    required: ["command"],
  },
  timeoutMs: 300_000, // 5 min — generous for multi-step shell commands
  requiresApproval: () => true,
  async execute(rawInput: unknown, ctx): Promise<ToolResult<Output>> {
    const input = rawInput as Input;
    const cwd = input.cwd ?? ctx.cwd;
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    // TODO: use context.sandbox when SandboxAdapter.exec() is wired.
    // ctx.sandbox is now populated by createToolExecutor() — replace the
    // spawn() block below with ctx.sandbox.exec({ command, cwd, env, ... })
    // once the mapping from Input → SandboxExecOptions is validated.
    //
    // Platform-aware spawn. On Windows, prefer pwsh > powershell > cmd.
    // PowerShell handles UTF-8, quoting, and multi-line scripts more
    // cleanly than cmd.exe's legacy parser. On POSIX, plain shell:true
    // (= /bin/sh -c).
    const child =
      process.platform === "win32"
        ? (() => {
            const shell = resolveWindowsShell();
            return spawn(shell.cmd, shell.args(input.command), {
              cwd,
              env: ctx.env,
              stdio: ["ignore", "pipe", "pipe"],
              windowsHide: true,
            });
          })()
        : spawn(input.command, {
            cwd,
            env: ctx.env,
            stdio: ["ignore", "pipe", "pipe"],
            shell: true,
          });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;

    // Shared total so combined stdout+stderr never exceeds MAX_OUTPUT_BYTES.
    let totalBytes = 0;

    const onData =
      (chunks: Buffer[], trackBytes: (n: number) => void) => (buf: Buffer) => {
        const remaining = MAX_OUTPUT_BYTES - totalBytes;
        if (remaining <= 0) {
          truncated = true;
          return;
        }
        const slice =
          buf.length <= remaining ? buf : buf.subarray(0, remaining);
        chunks.push(slice);
        totalBytes += slice.length;
        trackBytes(slice.length);
        if (buf.length > remaining) truncated = true;
        const text = slice.toString("utf8");
        if (text.trim().length > 0) ctx.onProgress?.(text.trimEnd());
      };

    child.stdout.on(
      "data",
      onData(stdoutChunks, (n) => {
        stdoutBytes += n;
      }),
    );
    child.stderr.on(
      "data",
      onData(stderrChunks, (n) => {
        stderrBytes += n;
      }),
    );

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    // Wire abort signal so Esc/cancel kills the child immediately.
    const onAbort = (): void => {
      child.kill("SIGKILL");
    };
    ctx.signal?.addEventListener("abort", onAbort, { once: true });

    const exitCode: number = await new Promise((resolveExit) => {
      child.on("error", () => resolveExit(-1));
      child.on("close", (code) => resolveExit(code ?? -1));
    });
    clearTimeout(timer);
    ctx.signal?.removeEventListener("abort", onAbort);

    const stdout = Buffer.concat(
      stdoutChunks as unknown as readonly Uint8Array[],
    ).toString("utf8");
    const stderr = Buffer.concat(
      stderrChunks as unknown as readonly Uint8Array[],
    ).toString("utf8");
    const banner = `exit=${exitCode}${truncated ? " [output truncated]" : ""}`;
    const body = [
      banner,
      stdout.length > 0 ? `STDOUT:\n${stdout}` : "",
      stderr.length > 0 ? `STDERR:\n${stderr}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      content: body.length > 0 ? body : banner,
      data: { exitCode, stdoutBytes, stderrBytes, truncated },
      isError: exitCode !== 0,
    };
  },
};
