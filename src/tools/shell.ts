/**
 * Shell command execution.
 *
 * Runs through a sandbox adapter when one is configured; otherwise
 * spawns a child process with inherited env. Output is captured with a
 * byte cap; on overflow we truncate and indicate the remaining size so
 * the model does not misread a capped stream as a complete one.
 *
 * Platform routing (1.13.0):
 *   posix → spawn('/bin/sh', ['-c', command])
 *   win32 → prefer pwsh > powershell > cmd.exe via env detection;
 *           fall back to cmd if PowerShell isn't on PATH. PowerShell
 *           handles quoting + UTF-8 + multi-line scripts more cleanly
 *           than cmd.exe's relic Windows-95 parser.
 *
 * Streaming mode (1.14.0):
 *   When `streamOutput: true` is passed, each stdout/stderr chunk is
 *   forwarded to `ctx.onProgress` as it arrives so the TUI can display
 *   live output. Accumulated output is still returned in the final
 *   ToolResult for the model. Backwards-compatible: default is false.
 */

import { spawn, execFile } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { Tool } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";

const execFileAsync = promisify(execFile);

interface Input {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  /** Stream output chunks via onProgress as they arrive (default: false). */
  streamOutput?: boolean;
}

/** Cached PowerShell executable detection (probed async at first use). */
let cachedWindowsShell: {
  cmd: string;
  args: (script: string) => string[];
} | null = null;
let windowsShellPromise: Promise<{
  cmd: string;
  args: (script: string) => string[];
}> | null = null;

async function resolveWindowsShell(): Promise<{
  cmd: string;
  args: (script: string) => string[];
}> {
  if (cachedWindowsShell) return cachedWindowsShell;
  if (!windowsShellPromise) {
    windowsShellPromise = (async () => {
      for (const exe of ["pwsh", "powershell"]) {
        try {
          await execFileAsync(exe, ["-NoLogo", "-Command", "exit 0"], {
            timeout: 3000,
          });
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
        } catch {}
      }
      cachedWindowsShell = {
        cmd: process.env.ComSpec ?? "cmd.exe",
        args: (script: string): string[] => ["/d", "/s", "/c", script],
      };
      return cachedWindowsShell;
    })();
  }
  return windowsShellPromise;
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
      timeoutMs: {
        type: "integer",
        minimum: 1000,
        description:
          "Hard timeout in milliseconds (default 120 000). On expiry the child " +
          "receives SIGTERM then SIGKILL after 2 s.",
      },
      streamOutput: {
        type: "boolean",
        description:
          "When true, forward each output chunk to the progress bus so the " +
          "TUI can display live output while the command runs. " +
          "Accumulated output is still returned in the final result. " +
          "Default: false.",
      },
    },
    required: ["command"],
  },
  timeoutMs: 300_000, // 5 min — generous for multi-step shell commands
  requiresApproval: () => true,
  async execute(rawInput: unknown, ctx): Promise<ToolResult<Output>> {
    const input = rawInput as Input;
    const cwd = input.cwd ?? ctx.cwd;
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const streamOutput = input.streamOutput ?? false;

    if (cwd !== ctx.cwd) {
      const resolved = resolve(cwd);
      const base = resolve(ctx.cwd);
      const baseSep = base.endsWith(sep) ? base : base + sep;
      if (resolved !== base && !resolved.startsWith(baseSep)) {
        return { content: `cwd escapes workspace: ${cwd}`, isError: true };
      }
    }

    const child =
      process.platform === "win32"
        ? (async () => {
            const shell = await resolveWindowsShell();
            return spawn(shell.cmd, shell.args(input.command), {
              cwd,
              env: ctx.env,
              stdio: ["pipe", "pipe", "pipe"],
              windowsHide: true,
            });
          })()
        : spawn("/bin/sh", ["-c", input.command], {
            cwd,
            env: ctx.env,
            stdio: ["pipe", "pipe", "pipe"],
          });

    const childProcess = await (child instanceof Promise
      ? child
      : Promise.resolve(child));

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;

    let totalBytes = 0;

    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");

    const onData =
      (
        chunks: Buffer[],
        decoder: StringDecoder,
        trackBytes: (n: number) => void,
        label: "STDOUT" | "STDERR",
      ) =>
      (buf: Buffer) => {
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
        const text = decoder.write(slice);
        if (text.trim().length > 0) {
          // In streaming mode forward every non-empty chunk immediately;
          // in non-streaming mode the existing behaviour is preserved
          // (progress is still emitted so the TUI spinner stays alive,
          // but callers that don't pass onProgress see no difference).
          if (streamOutput) {
            ctx.onProgress?.(
              label === "STDERR" ? `[stderr] ${text.trimEnd()}` : text.trimEnd(),
            );
          } else {
            ctx.onProgress?.(text.trimEnd());
          }
        }
      };

    childProcess.stdout.on(
      "data",
      onData(stdoutChunks, stdoutDecoder, (n) => {
        stdoutBytes += n;
      }, "STDOUT"),
    );
    childProcess.stderr.on(
      "data",
      onData(stderrChunks, stderrDecoder, (n) => {
        stderrBytes += n;
      }, "STDERR"),
    );

    /** Gracefully terminate: SIGTERM, then SIGKILL after 2 s. */
    const killChild = (): void => {
      childProcess.kill("SIGTERM");
      setTimeout(() => {
        try {
          childProcess.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }, 2_000);
    };

    const timer = setTimeout(killChild, timeoutMs);

    const onAbort = (): void => {
      killChild();
    };
    if (ctx.signal) {
      ctx.signal.addEventListener("abort", onAbort, { once: true });
    }

    const exitCode: number = await new Promise((resolveExit) => {
      childProcess.once("error", () => resolveExit(-1));
      childProcess.once("close", (code) => resolveExit(code ?? -1));
    });
    clearTimeout(timer);
    if (ctx.signal) {
      ctx.signal.removeEventListener("abort", onAbort);
    }

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
