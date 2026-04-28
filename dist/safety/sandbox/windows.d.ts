/**
 * Windows adapter. Full JobObject + integrity-level restriction needs a
 * native helper; v1 relies on path + environment scoping plus a
 * dedicated child process group and falls back to noop semantics for
 * actual containment. Declared as platform 'windows' so telemetry can
 * surface the status accurately.
 */
import type { SandboxAdapter, SandboxExecOptions, SandboxResult } from './iface.js';
export declare class WindowsSandbox implements SandboxAdapter {
    readonly platform: "windows";
    available(): Promise<boolean>;
    exec(opts: SandboxExecOptions): Promise<SandboxResult>;
}
