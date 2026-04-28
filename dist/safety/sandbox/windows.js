/**
 * Windows adapter. Full JobObject + integrity-level restriction needs a
 * native helper; v1 relies on path + environment scoping plus a
 * dedicated child process group and falls back to noop semantics for
 * actual containment. Declared as platform 'windows' so telemetry can
 * surface the status accurately.
 */
import { runDirect } from './noop.js';
export class WindowsSandbox {
    platform = 'windows';
    async available() {
        return process.platform === 'win32';
    }
    async exec(opts) {
        const env = { ...opts.env };
        if (!opts.networkAllowed) {
            env['DIRGHA_NETWORK_DISABLED'] = '1';
        }
        return runDirect({ ...opts, env }, 'windows');
    }
}
//# sourceMappingURL=windows.js.map