/**
 * macOS Seatbelt adapter. Wraps the command in `sandbox-exec` with a
 * generated profile that allows reads inside the cwd, allows writes to
 * the declared writablePaths, and gates network access per options.
 */
import type { SandboxAdapter, SandboxExecOptions, SandboxResult } from './iface.js';
export declare class SeatbeltSandbox implements SandboxAdapter {
    readonly platform: "macos";
    available(): Promise<boolean>;
    exec(opts: SandboxExecOptions): Promise<SandboxResult>;
}
