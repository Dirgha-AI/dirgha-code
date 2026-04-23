/** tools/shell.ts — Persistent-cwd shell execution tool (async — never blocks event loop)
 *
 * Uses /bin/bash -c for full shell syntax: pipes, &&, ||, 2>&1, $(), etc.
 * cd is handled to track cwd across calls.
 */
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { ToolResult } from "../types.js";
import { sandboxPath } from "./file.js";

const MAX_OUTPUT = 50_000;
const TIMEOUT_MS = 60_000;

const DANGEROUS_PATTERNS = [
  /\brm\s+.*(-r\s|-\s*r\s|-\s*f\s|-\s*-[rf]\s)[^;|&]*(;|&|$)/i,
  /\brm\s+--recursive\b/i,
  /\bmkfs\b/,
  /\bdd\s+if=/i,
  /\bshred\b/,
  /:\s*\(\s*\)\s*\{.*:\s*\|.*:\s*&\s*\}/,
  // Direct device writes
  />\s*\/dev\//i,
  // Privilege escalation
  /\bsudo\s/i,
  /\bsu\s+-/i,
  // System control
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bsystemctl\s+(stop|disable|mask)\s/i,
  // Git dangerous (force operations)
  /\bgit\s+(push\s+.*--force|reset\s+--hard|clean\s+.*-f|branch\s+.*-D)\b/i,
  // SQL dangerous
  /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE)\b/i,
  /\bDELETE\s+FROM\s+\w+\s*(;|\s*$)/i,
  /\bALTER\s+TABLE.*DROP\b/i,
  // Piped exploits
  /\bcurl.*\|\s*(ba)?sh\b/i,
  /\bwget.*\|\s*(ba)?sh\b/i,
  // Eval
  /\beval\s*\(/i,
  // Process killers
  /\bkill\s+-9\b|\bpkill\b/i,
  /\bpm2\s+(delete\s+all|kill)\b/i,
  // Docker dangerous
  /\bdocker\s+(rm|rmi)\s+-f\b|\bdocker\s+system\s+prune\b/i,
  // Kubernetes dangerous
  /\bkubectl\s+delete\b/i,
  // Terraform dangerous
  /\bterraform\s+destroy\b/i,
  // Overwrite system files
  />\s*\/(etc|boot|usr|lib)\//i,
  // iptables flush
  /\biptables\s+-F\b/i,
];

// Safe command safelist (only these base commands are allowed)
// All other commands are blocked or require confirmation
const SAFE_COMMAND_BASES = new Set([
  "ls",
  "ll",
  "la",
  "pwd",
  "echo",
  "cat",
  "head",
  "tail",
  "grep",
  "find",
  "sed",
  "awk",
  "sort",
  "uniq",
  "wc",
  "cut",
  "tr",
  "nl",
  "pr",
  "fmt",
  "fold",
  "od",
  "dd",
  "git",
  "npm",
  "pnpm",
  "yarn",
  "node",
  "npx",
  "tsc",
  "esbuild",
  "vite",
  "cargo",
  "rustc",
  "go",
  "python",
  "python3",
  "pip",
  "pip3",
  "make",
  "cmake",
  "gcc",
  "g++",
  "clang",
  "cd",
  "mkdir",
  "rmdir",
  "touch",
  "cp",
  "mv",
  "ln",
  "tar",
  "zip",
  "unzip",
  "gzip",
  "gunzip",
  "ssh",
  "scp",
  "rsync",
  "wget",
  "curl",
  "ps",
  "top",
  "htop",
  "df",
  "du",
  "free",
  "uptime",
  "date",
  "time",
  "whoami",
  "id",
  "uname",
  "hostname",
]);

function getBaseCommand(command: string): string | null {
  // Extract the first token (base command) from the command
  // Handle cases like: sudo command, env VAR=val command, etc.
  const cleaned = command.trim();

  // Skip leading env vars and sudo
  const tokens = cleaned.split(/\s+/);
  let i = 0;

  // Skip env vars (KEY=VALUE)
  while (i < tokens.length && /^[A-Z_][A-Z0-9_]*=/.test(tokens[i]!)) i++;

  // Skip sudo/su
  if (i < tokens.length && (tokens[i]! === "sudo" || tokens[i]! === "su")) i++;

  if (i >= tokens.length) return null;

  // Get base command (before any /path/ prefix)
  const full = tokens[i]!;
  const base = full.split("/").pop()!.split(" ")[0]!;
  return base;
}

let currentCwd = process.cwd();

function runAsync(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
}> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, LANG: "en_US.UTF-8" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
    }, timeoutMs);

    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, signal: signal ?? null });
    });
  });
}

/** Run a shell command via /bin/bash — async, never blocks the event loop. */
export async function runCommandTool(
  input: Record<string, any>,
): Promise<ToolResult> {
  const command = ((input["command"] as string) ?? "").trim();
  if (!command)
    return {
      tool: "run_command",
      result: "",
      error: "Command must be a non-empty string",
    };

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        tool: "run_command",
        result: "",
        error: "Command blocked: matches dangerous pattern",
      };
    }
  }

  // Check if base command is in safelist
  const baseCmd = getBaseCommand(command);
  if (baseCmd && !SAFE_COMMAND_BASES.has(baseCmd)) {
    return {
      tool: "run_command",
      result: "",
      error: `Command '${baseCmd}' is not in the safelist. Allowed: Array.from(SAFE_COMMAND_BASES).slice(0, 10).join(", ")}...`,
    };
  }

  // Track `cd` when it's the sole command
  const cdMatch = command.match(/^cd\s+([^\s;&|]+)\s*$/);
  if (cdMatch) {
    try {
      const rawPath = cdMatch[1]!.trim().replace(/^['"]|['"]$/g, "");
      const newPath = sandboxPath(rawPath);
      statSync(newPath);
      currentCwd = newPath;
      return { tool: "run_command", result: `cwd: ${currentCwd}` };
    } catch {
      return {
        tool: "run_command",
        result: "",
        error: `cd: no such directory: ${cdMatch[1]}`,
      };
    }
  }

  try {
    const { stdout, stderr, code, signal } = await runAsync(
      "/bin/bash",
      ["-c", command],
      currentCwd,
      TIMEOUT_MS,
    );
    const combined = (stdout + stderr).slice(0, MAX_OUTPUT).trimEnd();

    if (signal)
      return {
        tool: "run_command",
        result: combined,
        error: `killed by signal ${signal}`,
      };
    if (code !== 0)
      return { tool: "run_command", result: combined || `exit ${code}` };
    return { tool: "run_command", result: combined };
  } catch (e: any) {
    return {
      tool: "run_command",
      result: "",
      error: String(e.message ?? e).slice(0, MAX_OUTPUT),
    };
  }
}
