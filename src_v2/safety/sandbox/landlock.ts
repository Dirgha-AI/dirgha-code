/**
 * Linux Landlock adapter.
 *
 * Landlock is a kernel-level LSM (Linux 5.13+) that lets an unprivileged
 * process restrict its own filesystem view. Native use requires a small
 * C helper to call landlock_create_ruleset / landlock_add_rule /
 * landlock_restrict_self before exec. The v1 implementation here is a
 * safe fallback that delegates to bwrap when that adapter is available;
 * the native Landlock path ships as a prebuilt helper binary in a later
 * sprint.
 */

import type { SandboxAdapter, SandboxExecOptions, SandboxResult } from './iface.js';
import { BwrapSandbox } from './bwrap.js';
import { NoopSandbox } from './noop.js';

export class LandlockSandbox implements SandboxAdapter {
  readonly platform = 'linux' as const;

  async available(): Promise<boolean> {
    return false;
  }

  async exec(opts: SandboxExecOptions): Promise<SandboxResult> {
    const bwrap = new BwrapSandbox();
    if (await bwrap.available()) return bwrap.exec(opts);
    return new NoopSandbox().exec(opts);
  }
}
