/**
 * Linux bubblewrap adapter. Binds the cwd read-write, binds selected
 * paths read-only, unshares network when not allowed. Bubblewrap must
 * be installed; falls back via availability check.
 */
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { runDirect } from './noop.js';
const BWRAP = '/usr/bin/bwrap';
export class BwrapSandbox {
    platform = 'linux-bwrap';
    async available() {
        try {
            accessSync(BWRAP, constants.X_OK);
            return true;
        }
        catch {
            return false;
        }
    }
    async exec(opts) {
        const args = [
            '--die-with-parent',
            '--new-session',
            '--proc', '/proc',
            '--dev', '/dev',
            '--tmpfs', '/tmp',
            '--ro-bind', '/usr', '/usr',
            '--ro-bind', '/etc', '/etc',
            '--ro-bind', '/lib', '/lib',
            '--ro-bind', '/lib64', '/lib64',
            '--bind', opts.cwd, opts.cwd,
            '--chdir', opts.cwd,
        ];
        for (const path of opts.readOnlyPaths ?? []) {
            args.push('--ro-bind', path, path);
        }
        for (const path of opts.writablePaths ?? []) {
            args.push('--bind', path, path);
        }
        if (!opts.networkAllowed)
            args.push('--unshare-net');
        args.push('--unshare-ipc', '--unshare-pid', '--unshare-uts', '--unshare-cgroup-try');
        const result = await runDirect({
            ...opts,
            command: [BWRAP, ...args, ...opts.command],
        }, 'linux-bwrap');
        return result;
    }
}
void join;
//# sourceMappingURL=bwrap.js.map