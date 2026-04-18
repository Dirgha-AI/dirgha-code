// @ts-nocheck
// SPDX-License-Identifier: BUSL-1.1
import { Command } from 'commander';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import { writeCredentials } from '../utils/credentials.js';
import { execCmd } from '../utils/safe-exec.js';

const API = process.env.DIRGHA_API_URL || 'https://api.dirgha.ai';

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with Dirgha AI via device flow')
    .option('--browser', 'Automatically open browser for authentication')
    .action(async (options) => {
      try {
        const res = await fetch(`${API}/api/auth/device/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: 'dirgha-cli' })
        });
        if (!res.ok) throw new Error('Failed to initiate device flow');
        
        const { device_code, user_code, verification_uri, interval, expires_in } = await res.json();
        const verification_url = verification_uri;
        
        console.log(chalk.cyan('\n🔐 Authentication Required\n'));
        console.log(chalk.white('User Code: ') + chalk.bold.bgWhite.black(` ${user_code} `));
        console.log(chalk.white('URL: ') + chalk.underline(verification_url));
        console.log();
        
        qrcode.generate(verification_url, { small: true }, (qr) => {
          console.log(qr);
          console.log(chalk.gray('Scan QR code or visit URL above\n'));
        });
        
        if (options.browser) {
          const platform = process.platform;
          const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd /c start' : 'xdg-open';
          execCmd(`${cmd} ${verification_url}`);
        }
        
        const startTime = Date.now();
        const timeoutMs = expires_in * 1000;
        
        const poll = async (): Promise<void> => {
          try {
            const pollRes = await fetch(`${API}/api/auth/device/poll?device_code=${device_code}`, {
              method: 'GET'
            });
            
            if (pollRes.status === 200) {
              const creds = await pollRes.json();
              if (creds.status === 'authorized') {
                writeCredentials({
                  token: creds.token,
                  userId: creds.user.id,
                  email: creds.user.email,
                  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                });
                console.log(chalk.green('\n✓ Successfully authenticated\n'));
                process.exit(0);
              } else {
                setTimeout(poll, interval * 1000);
              }
            } else if (pollRes.status === 202) {
              setTimeout(poll, interval * 1000);
            } else if (pollRes.status === 410) {
              console.log(chalk.red('\n✗ Authentication timeout or expired\n'));
              process.exit(1);
            } else {
              setTimeout(poll, interval * 1000);
            }
          } catch (err) {
            console.log(chalk.red('\n✗ API unreachable'));
            console.log(chalk.yellow('Opening fallback login page...'));
            const platform = process.platform;
            const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd /c start' : 'xdg-open';
            execCmd(`${cmd} https://dirgha.ai/login`);
            process.exit(1);
          }
        };
        
        setTimeout(poll, interval * 1000);
      } catch (err) {
        console.log(chalk.red('Failed to start authentication'));
        process.exit(1);
      }
    });
}

// Legacy alias for src/commands/setup.ts
export async function loginCommand(): Promise<void> {
  const { program } = await import('commander');
  const tmp = program;
  // If setup.ts calls loginCommand() directly (no arg), trigger the same flow:
  const { Command } = await import('commander');
  const p = new Command();
  registerLoginCommand(p);
  const cmd = p.commands.find((c: any) => c.name() === 'login');
  if (cmd && typeof (cmd as any)._actionHandler === 'function') {
    await (cmd as any)._actionHandler([{}, p]);
  }
}
