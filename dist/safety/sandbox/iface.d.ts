/**
 * Sandbox adapter contract. The command-execution layer calls exec()
 * and receives stdout/stderr/exit-code. Adapters decide how to contain
 * the child process: macOS Seatbelt, Linux Landlock/bwrap, Windows
 * JobObject, or a noop pass-through when no platform support exists.
 */
export type SandboxPlatform = 'macos' | 'linux' | 'linux-bwrap' | 'windows' | 'noop';
export interface SandboxExecOptions {
    command: string[];
    cwd: string;
    env: Record<string, string>;
    readOnlyPaths?: string[];
    writablePaths?: string[];
    networkAllowed: boolean;
    timeoutMs: number;
    signal?: AbortSignal;
}
export interface SandboxResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
    platform: SandboxPlatform;
}
export interface SandboxAdapter {
    readonly platform: SandboxPlatform;
    available(): Promise<boolean>;
    exec(opts: SandboxExecOptions): Promise<SandboxResult>;
}
