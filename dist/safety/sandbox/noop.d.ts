/**
 * Fallback sandbox that runs the command as the current user without
 * isolation. Used when no platform adapter is available; clearly
 * reports platform 'noop' so callers can warn.
 */
import type { SandboxAdapter, SandboxExecOptions, SandboxResult } from "./iface.js";
export declare class NoopSandbox implements SandboxAdapter {
    readonly platform: "noop";
    available(): Promise<boolean>;
    exec(opts: SandboxExecOptions): Promise<SandboxResult>;
}
export declare function runDirect(opts: SandboxExecOptions, platform: "noop" | "macos" | "linux" | "linux-bwrap" | "windows"): Promise<SandboxResult>;
