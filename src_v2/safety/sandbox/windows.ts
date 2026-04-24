/**
 * Windows adapter. Full JobObject + integrity-level restriction needs a
 * native helper; v1 relies on path + environment scoping plus a
 * dedicated child process group and falls back to noop semantics for
 * actual containment. Declared as platform 'windows' so telemetry can
 * surface the status accurately.
 */

import type { SandboxAdapter, SandboxExecOptions, SandboxResult } from './iface.js';
import { runDirect } from './noop.js';

export class WindowsSandbox implements SandboxAdapter {
  readonly platform = 'windows' as const;

  async available(): Promise<boolean> {
    return process.platform === 'win32';
  }

  async exec(opts: SandboxExecOptions): Promise<SandboxResult> {
    const env = { ...opts.env };
    if (!opts.networkAllowed) {
      env['DIRGHA_NETWORK_DISABLED'] = '1';
    }
    return runDirect({ ...opts, env }, 'windows');
  }
}
