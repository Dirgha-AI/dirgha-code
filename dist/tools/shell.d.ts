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
import type { Tool } from "./registry.js";
export declare const shellTool: Tool;
