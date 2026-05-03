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
 */
import { spawn, execFile } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
/** Cached PowerShell executable detection (probed async at first use). */
let cachedWindowsShell = null;
let windowsShellPromise = null;
async function resolveWindowsShell() {
    if (cachedWindowsShell)
        return cachedWindowsShell;
    if (!windowsShellPromise) {
        windowsShellPromise = (async () => {
            for (const exe of ["pwsh", "powershell"]) {
                try {
                    await execFileAsync(exe, ["-NoLogo", "-Command", "exit 0"], {
                        timeout: 3000,
                    });
                    cachedWindowsShell = {
                        cmd: exe,
                        args: (script) => [
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
                catch { }
            }
            cachedWindowsShell = {
                cmd: process.env.ComSpec ?? "cmd.exe",
                args: (script) => ["/d", "/s", "/c", script],
            };
            return cachedWindowsShell;
        })();
    }
    return windowsShellPromise;
}
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 256 * 1024;
export const shellTool = {
    name: "shell",
    description: process.platform === "win32"
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
    async execute(rawInput, ctx) {
        const input = rawInput;
        const cwd = input.cwd ?? ctx.cwd;
        const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        if (cwd !== ctx.cwd) {
            const resolved = resolve(cwd);
            const base = resolve(ctx.cwd);
            const baseSep = base.endsWith(sep) ? base : base + sep;
            if (resolved !== base && !resolved.startsWith(baseSep)) {
                return { content: `cwd escapes workspace: ${cwd}`, isError: true };
            }
        }
        const child = process.platform === "win32"
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
        const stdoutChunks = [];
        const stderrChunks = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let truncated = false;
        let totalBytes = 0;
        const stdoutDecoder = new StringDecoder("utf8");
        const stderrDecoder = new StringDecoder("utf8");
        const onData = (chunks, decoder, trackBytes) => (buf) => {
            const remaining = MAX_OUTPUT_BYTES - totalBytes;
            if (remaining <= 0) {
                truncated = true;
                return;
            }
            const slice = buf.length <= remaining ? buf : buf.subarray(0, remaining);
            chunks.push(slice);
            totalBytes += slice.length;
            trackBytes(slice.length);
            if (buf.length > remaining)
                truncated = true;
            const text = decoder.write(slice);
            if (text.trim().length > 0)
                ctx.onProgress?.(text.trimEnd());
        };
        childProcess.stdout.on("data", onData(stdoutChunks, stdoutDecoder, (n) => {
            stdoutBytes += n;
        }));
        childProcess.stderr.on("data", onData(stderrChunks, stderrDecoder, (n) => {
            stderrBytes += n;
        }));
        const timer = setTimeout(() => {
            if (process.platform === "win32") {
                childProcess.kill("SIGTERM");
            }
            else {
                childProcess.kill("SIGKILL");
            }
        }, timeoutMs);
        const onAbort = () => {
            if (process.platform === "win32") {
                childProcess.kill("SIGTERM");
            }
            else {
                childProcess.kill("SIGKILL");
            }
        };
        if (ctx.signal) {
            ctx.signal.addEventListener("abort", onAbort, { once: true });
        }
        const exitCode = await new Promise((resolveExit) => {
            childProcess.once("error", () => resolveExit(-1));
            childProcess.once("close", (code) => resolveExit(code ?? -1));
        });
        clearTimeout(timer);
        if (ctx.signal) {
            ctx.signal.removeEventListener("abort", onAbort);
        }
        const stdout = Buffer.concat(stdoutChunks).toString("utf8");
        const stderr = Buffer.concat(stderrChunks).toString("utf8");
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
//# sourceMappingURL=shell.js.map