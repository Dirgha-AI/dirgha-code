import { spawnSync, SpawnSyncOptions } from 'child_process';

/**
 * Execute a command via spawnSync with array arguments.
 * Array args prevent shell injection — no string concatenation in a shell.
 * Note: running as root means commands have full system access regardless.
 */
export function execCmd(cmd: string, args: string[], options: SpawnSyncOptions = {}): string {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    ...options
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command "${cmd} ${args.join(' ')}" failed with status ${result.status}: ${result.stderr}`);
  }

  return (result.stdout as string || '').trim();
}

export type ExecResult = { stdout: string; stderr: string; exitCode: number };

/**
 * Execute git with array arguments.
 */
export function gitCmd(args: string[], options: SpawnSyncOptions = {}): string {
  return execCmd('git', args, options);
}

/**
 * Execute GitHub CLI with array arguments.
 */
export function ghCmd(args: string[], options: SpawnSyncOptions = {}): string {
  return execCmd('gh', args, options);
}
