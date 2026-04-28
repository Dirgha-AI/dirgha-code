/**
 * Linux bubblewrap adapter. Binds the cwd read-write, binds selected
 * paths read-only, unshares network when not allowed. Bubblewrap must
 * be installed; falls back via availability check.
 */
import type { SandboxAdapter, SandboxExecOptions, SandboxResult } from './iface.js';
export declare class BwrapSandbox implements SandboxAdapter {
    readonly platform: "linux-bwrap";
    available(): Promise<boolean>;
    exec(opts: SandboxExecOptions): Promise<SandboxResult>;
}
