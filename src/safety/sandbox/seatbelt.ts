/**
 * macOS Seatbelt adapter. Wraps the command in `sandbox-exec` with a
 * generated profile that allows reads inside the cwd, allows writes to
 * the declared writablePaths, and gates network access per options.
 */

import { accessSync, constants } from "node:fs";
import type {
  SandboxAdapter,
  SandboxExecOptions,
  SandboxResult,
} from "./iface.js";
import { runDirect } from "./noop.js";

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

export class SeatbeltSandbox implements SandboxAdapter {
  readonly platform = "macos" as const;

  async available(): Promise<boolean> {
    try {
      accessSync(SANDBOX_EXEC, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  async exec(opts: SandboxExecOptions): Promise<SandboxResult> {
    const profile = buildProfile(opts);
    return runDirect(
      {
        ...opts,
        command: [SANDBOX_EXEC, "-p", profile, ...opts.command],
      },
      "macos",
    );
  }
}

function buildProfile(opts: SandboxExecOptions): string {
  const read = (opts.readOnlyPaths ?? [opts.cwd])
    .map((p) => `(subpath "${escape(p)}")`)
    .join(" ");
  const write = (opts.writablePaths ?? [opts.cwd])
    .map((p) => `(subpath "${escape(p)}")`)
    .join(" ");
  const net = opts.networkAllowed ? "(allow network*)" : "(deny network*)";
  return `
(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow signal)
(allow file-read* ${read})
(allow file-read* (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random") (literal "/dev/tty"))
(allow file-write* ${write} (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr"))
(allow sysctl-read)
(allow mach-lookup)
${net}
`.trim();
}

function escape(path: string): string {
  if (/[()"\n\r\t]/.test(path)) {
    throw new Error(
      `Seatbelt sandbox path contains unsafe characters: ${path}`,
    );
  }
  return path.replace(/"/g, '\\"');
}
