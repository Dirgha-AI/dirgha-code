// SPDX-License-Identifier: BUSL-1.1
import { Command } from 'commander';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import { writeCredentials } from '../utils/credentials.js';
import { execCmd } from '../utils/safe-exec.js';

const API = process.env['DIRGHA_API_URL'] || 'https://api.dirgha.ai';

export interface LoginOptions {
  token?: string;
  email?: string;
  userId?: string;
  browser?: boolean;
}

/**
 * Headless login path: user passes --token (obtained from dirgha.ai
 * dashboard). No device flow, no browser.
 */
async function loginWithToken(opts: LoginOptions): Promise<void> {
  if (!opts.token) throw new Error('--token is required for headless login');
  const email = opts.email ?? 'api-user@dirgha.ai';
  const userId = opts.userId ?? `api-${opts.token.slice(0, 8)}`;

  writeCredentials({
    token: opts.token,
    userId,
    email,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Verify token is valid by calling the gateway
  try {
    const res = await fetch(`${API}/api/billing/quota`, {
      headers: { Authorization: `Bearer ${opts.token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      console.log(chalk.green('\n✓ Token accepted — credentials saved to ~/.dirgha/credentials.json\n'));
    } else if (res.status === 401) {
      console.log(chalk.red('\n✗ Token rejected (401). Check your API token at https://dirgha.ai/dashboard\n'));
      process.exit(1);
    } else {
      console.log(chalk.yellow(`\n⚠ Token saved but gateway returned ${res.status}. Will retry on next request.\n`));
    }
  } catch {
    console.log(chalk.yellow('\n⚠ Token saved but API is unreachable right now — will verify on next use.\n'));
  }
}

/** Device-flow login (interactive). */
async function loginWithDeviceFlow(opts: LoginOptions): Promise<void> {
  const res = await fetch(`${API}/api/auth/device/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'dirgha-code' }),
  });
  if (!res.ok) throw new Error('Failed to initiate device flow');

  const { device_code, user_code, verification_uri, interval, expires_in } = await res.json() as any;
  const verification_url = verification_uri;

  console.log(chalk.cyan('\n🔐 Sign in to Dirgha\n'));
  console.log(chalk.white('Code: ') + chalk.bold.bgWhite.black(` ${user_code} `));
  console.log(chalk.white('URL:  ') + chalk.underline(verification_url));
  console.log();
  qrcode.generate(verification_url, { small: true }, (qr) => {
    console.log(qr);
    console.log(chalk.gray('Scan, or visit the URL and enter the code. Ctrl+C to cancel.\n'));
  });

  if (opts.browser) {
    const platform = process.platform;
    if (platform === 'darwin') execCmd('open', [verification_url]);
    else if (platform === 'win32') execCmd('cmd', ['/c', 'start', verification_url]);
    else execCmd('xdg-open', [verification_url]);
  }

  // Poll
  const poll = async (): Promise<void> => {
    let attempts = 0;
    const maxAttempts = Math.ceil(expires_in / interval);
    while (attempts++ < maxAttempts) {
      try {
        const r = await fetch(`${API}/api/auth/device/poll?device_code=${device_code}`);
        if (r.status === 200) {
          const creds = await r.json() as any;
          if (creds.status === 'authorized') {
            writeCredentials({
              token: creds.token,
              userId: creds.user?.id ?? 'unknown',
              email: creds.user?.email ?? 'unknown',
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            });
            console.log(chalk.green(`\n✓ Signed in as ${creds.user?.email ?? 'you'}\n`));
            return;
          }
        } else if (r.status === 410) {
          console.log(chalk.red('\n✗ Code expired. Run `dirgha login` to try again.\n'));
          process.exit(1);
        }
      } catch {
        // Network blip — keep polling
      }
      await new Promise(r => setTimeout(r, interval * 1000));
    }
    console.log(chalk.red('\n✗ Sign-in timed out after 15 minutes.\n'));
    process.exit(1);
  };
  await poll();
}

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Sign in to Dirgha (device flow) or set a token (--token)')
    .option('--token <token>', 'Use an API token from dirgha.ai/dashboard (headless)')
    .option('--email <email>', 'Email to save with the token')
    .option('--user-id <id>', 'User ID to save with the token')
    .option('--browser', 'Auto-open the sign-in URL in your browser')
    .action(async (opts: LoginOptions) => {
      try {
        if (opts.token) await loginWithToken(opts);
        else await loginWithDeviceFlow(opts);
      } catch (err) {
        console.log(chalk.red(`\n✗ Login failed: ${err instanceof Error ? err.message : String(err)}\n`));
        process.exit(1);
      }
    });

  program
    .command('signup')
    .description('Create a new Dirgha account (opens browser + device flow)')
    .action(async () => {
      const signupUrl = `${API.replace('api.', '').replace(/^https?:\/\//, 'https://')}/signup?source=cli`;
      console.log(chalk.cyan('\n📝 Create a Dirgha account\n'));
      console.log(chalk.white('Opening: ') + chalk.underline(signupUrl));
      console.log(chalk.dim('After signing up, run `dirgha login` to connect this CLI to your account.\n'));
      try {
        const platform = process.platform;
        if (platform === 'darwin') execCmd('open', [signupUrl]);
        else if (platform === 'win32') execCmd('cmd', ['/c', 'start', signupUrl]);
        else execCmd('xdg-open', [signupUrl]);
      } catch {
        console.log(chalk.yellow('Could not open browser. Visit the URL above manually.\n'));
      }
    });
}

/** Callable from index.ts for backward compat. */
export async function loginCommand(opts: LoginOptions = {}): Promise<void> {
  try {
    if (opts.token) await loginWithToken(opts);
    else await loginWithDeviceFlow(opts);
  } catch (err) {
    console.log(chalk.red(`\n✗ Login failed: ${err instanceof Error ? err.message : String(err)}\n`));
    process.exit(1);
  }
}
