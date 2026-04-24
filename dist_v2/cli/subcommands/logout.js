/**
 * `dirgha logout` — clear the cached credentials.
 *
 * Calls `clearToken()` (unlinks `~/.dirgha/credentials.json`) and
 * prints a single confirmation line. Always exits 0, even when no
 * token exists — idempotent sign-out matches curl/gh conventions.
 */
import { stdout } from 'node:process';
import { clearToken } from '../../integrations/device-auth.js';
import { defaultTheme, style } from '../../tui/theme.js';
export async function runLogout(_argv) {
    await clearToken();
    stdout.write(`${style(defaultTheme.success, 'Signed out.')}\n`);
    return 0;
}
export const logoutSubcommand = {
    name: 'logout',
    description: 'Clear cached credentials',
    async run(argv) { return runLogout(argv); },
};
//# sourceMappingURL=logout.js.map