/**
 * `dirgha auth` subcommand group: login (device code), logout, whoami.
 * Uses the integrations/auth.ts client; prints friendly output.
 */

import { createAuthClient, type AuthToken } from '../integrations/auth.js';
import { style, defaultTheme } from '../tui/theme.js';

export interface AuthCmdArgs {
  op: 'login' | 'logout' | 'whoami';
  gatewayUrl?: string;
  openBrowser?: boolean;
}

export async function runAuth(args: AuthCmdArgs): Promise<number> {
  const client = createAuthClient({
    gatewayUrl: args.gatewayUrl,
    openBrowser: args.openBrowser === false
      ? () => { /* silent */ }
      : url => tryLaunchBrowser(url),
  });

  switch (args.op) {
    case 'login': {
      try {
        const token = await client.login();
        print(style(defaultTheme.success, `\n✓ Signed in as ${token.email ?? token.userId}`));
        print(`Scope: ${token.scope.join(', ') || '(none)'}`);
        print(`Expires: ${token.expiresAt}`);
        return 0;
      } catch (err) {
        print(style(defaultTheme.danger, `\n✗ Login failed: ${err instanceof Error ? err.message : String(err)}`));
        print(`\nIf the gateway is not yet available, set DIRGHA_GATEWAY_URL to your own instance,`);
        print(`or use BYOK (set provider API keys via env / ~/.dirgha/env) to run locally without signing in.`);
        return 1;
      }
    }
    case 'logout': {
      await client.logout();
      print(style(defaultTheme.success, '✓ Signed out'));
      return 0;
    }
    case 'whoami': {
      const token = await client.currentToken();
      if (!token) {
        print('Not signed in. Run `dirgha auth login` or set provider API keys to use BYOK.');
        return 1;
      }
      print(renderWhoami(token));
      return 0;
    }
  }
}

function renderWhoami(token: AuthToken): string {
  const lines = [
    style(defaultTheme.accent, `Signed in as ${token.email || token.userId}`),
    `  user id: ${token.userId}`,
    `  scope:   ${token.scope.join(', ') || '(none)'}`,
    `  expires: ${token.expiresAt}`,
  ];
  return lines.join('\n');
}

function tryLaunchBrowser(url: string): void {
  print(`Open in a browser to continue:\n  ${url}`);
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  import('node:child_process').then(({ spawn }) => {
    try {
      spawn(opener, [url], { stdio: 'ignore', detached: true }).unref();
    } catch { /* ignore; user will copy the URL manually */ }
  }).catch(() => { /* module unavailable; noop */ });
}

function print(line: string): void {
  process.stdout.write(line + '\n');
}
