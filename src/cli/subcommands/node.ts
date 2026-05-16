/**
 * `dirgha node <start|stop|status|invite>` — background daemon that contributes
 * idle compute/bandwidth and earns Dirgha Credits automatically.
 *
 * Inspired by Grass Network's model: install once, run daemon, earn Credits
 * redeemable for premium model access.
 *
 * PID file: ~/.dirgha/node.pid
 * Heartbeat: POST /api/node/heartbeat every 60 seconds.
 * Credits: 1 per heartbeat (= 1/min). 20% referral bonus for 90 days.
 */

import { stdout, stderr } from 'node:process';
import { readFile, writeFile, unlink, stat, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { homedir, cpus, totalmem, freemem, platform, arch } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import { loadToken } from '../../integrations/device-auth.js';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLI_VERSION: string = (() => {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req('../../../package.json') as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0-dev';
  } catch { return '0.0.0-dev'; }
})();

const DEFAULT_GATEWAY = 'https://api.dirgha.ai';
const HEARTBEAT_INTERVAL_MS = 60_000;

function gatewayBase(): string {
  return process.env.DIRGHA_API_BASE ?? DEFAULT_GATEWAY;
}

function pidFilePath(): string {
  return join(homedir(), '.dirgha', 'node.pid');
}

function print(line: string): void {
  stdout.write(`${line}\n`);
}

function err(line: string): void {
  stderr.write(`${line}\n`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function ramFreeGb(): number {
  return +(freemem() / 1_073_741_824).toFixed(2);
}

function cpuCount(): number {
  return cpus().length;
}

async function writePid(): Promise<void> {
  await mkdir(join(homedir(), '.dirgha'), { recursive: true });
  await writeFile(pidFilePath(), String(process.pid), 'utf8');
}

async function removePid(): Promise<void> {
  await unlink(pidFilePath()).catch(() => undefined);
}

async function readPid(): Promise<number | null> {
  const text = await readFile(pidFilePath(), 'utf8').catch(() => undefined);
  if (!text) return null;
  const n = parseInt(text.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = existence check
    return true;
  } catch {
    return false;
  }
}

async function pidMtime(): Promise<Date | null> {
  const info = await stat(pidFilePath()).catch(() => null);
  return info ? info.mtime : null;
}

function formatUptime(since: Date): string {
  const secs = Math.floor((Date.now() - since.getTime()) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ---------------------------------------------------------------------------
// Heartbeat POST
// ---------------------------------------------------------------------------

interface HeartbeatResponse {
  credits_earned: number;
  session_total: number;
  balance: number;
}

async function sendHeartbeat(token: string): Promise<HeartbeatResponse | { status: 401 | 'error' }> {
  const body = JSON.stringify({
    cpu_cores:   cpuCount(),
    ram_free_gb: ramFreeGb(),
    platform:    platform(),
    arch:        arch(),
    version:     CLI_VERSION,
  });

  try {
    const response = await fetch(`${gatewayBase()}/api/node/heartbeat`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body,
    });

    if (response.status === 401) return { status: 401 };
    if (!response.ok)            return { status: 'error' };

    return (await response.json()) as HeartbeatResponse;
  } catch {
    return { status: 'error' };
  }
}

// ---------------------------------------------------------------------------
// Subcommand: start
// ---------------------------------------------------------------------------

async function runStart(detach = false): Promise<number> {
  if (detach) {
    // Spawn a detached copy of this process without the --detach flag.
    const args = process.argv.slice(1).filter(a => a !== '--detach');
    const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' });
    child.unref();
    print(`${style(defaultTheme.accent, '◆')} Node daemon started in background (PID ${child.pid}).`);
    print(`  Run ${style(defaultTheme.accent, 'dirgha node status')} to check health.`);
    return 0;
  }

  const tok = await loadToken();
  if (!tok) {
    err(`Login required: run ${style(defaultTheme.accent, 'dirgha auth login')}`);
    return 1;
  }

  const cores    = cpuCount();
  const cpuModel = cpus()[0]?.model ?? 'unknown';
  const ramGb    = (totalmem() / 1_073_741_824).toFixed(1);
  const ramFree  = ramFreeGb();

  await writePid();

  print('');
  print(style(defaultTheme.accent, '◆ Dirgha Node started'));
  print(`  ${'contributing'.padEnd(12)} CPU: ${cores} cores (${cpuModel.split(' ')[0]}) · RAM: ${ramFree} GB free of ${ramGb} GB`);
  print(`  ${'earning'.padEnd(12)} Dirgha Credits (redeemable for model access)`);
  print(`  press Ctrl+C to stop`);
  print('');

  let sessionTotal = 0;

  const cleanup = async () => {
    await removePid();
    stdout.write(`\n${style(defaultTheme.accent, '◆ Node stopped.')} Session credits: ${sessionTotal}\n`);
    process.exit(0);
  };

  process.on('SIGINT',  cleanup);
  process.on('SIGTERM', cleanup);

  // Run heartbeat loop indefinitely (Ctrl+C exits via SIGINT handler)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise<void>(r => setTimeout(r, HEARTBEAT_INTERVAL_MS));

    const result = await sendHeartbeat(tok.token);

    if ('status' in result) {
      if (result.status === 401) {
        err(`Session expired. Run ${style(defaultTheme.accent, 'dirgha auth login')}.`);
        await removePid();
        process.exit(1);
      }
      // Network error — keep running
      stdout.write(`[${formatTime()}] ${style(defaultTheme.muted, '[warn] heartbeat failed — retrying in 60s')}\n`);
      continue;
    }

    sessionTotal = result.session_total;
    stdout.write(
      `[${formatTime()}] ${style(defaultTheme.success, `+${result.credits_earned} credits`)}` +
      `  ${style(defaultTheme.muted, `(session: ${result.session_total}  balance: ${result.balance})`)}\n`
    );
  }
}

// ---------------------------------------------------------------------------
// Subcommand: stop
// ---------------------------------------------------------------------------

async function runStop(): Promise<number> {
  const pid = await readPid();
  if (pid === null) {
    print('No node running.');
    return 0;
  }
  if (!isPidRunning(pid)) {
    await removePid();
    print('No node running (stale PID file cleaned up).');
    return 0;
  }
  try {
    process.kill(pid, 'SIGTERM');
    print(style(defaultTheme.success, `✓ Stop signal sent to node (pid ${pid})`));
    return 0;
  } catch (e) {
    err(`Failed to signal pid ${pid}: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

// ---------------------------------------------------------------------------
// Subcommand: status
// ---------------------------------------------------------------------------

async function runStatus(): Promise<number> {
  const pid = await readPid();
  if (pid === null || !isPidRunning(pid)) {
    if (pid !== null) await removePid(); // clean stale
    print('No node running.');
    return 0;
  }

  const mtime = await pidMtime();
  const uptime = mtime ? formatUptime(mtime) : 'unknown';

  print(style(defaultTheme.accent, '◆ Dirgha Node is running'));
  print(`  pid     ${pid}`);
  print(`  uptime  ${uptime}`);
  return 0;
}

// ---------------------------------------------------------------------------
// Subcommand: invite
// ---------------------------------------------------------------------------

async function runInvite(): Promise<number> {
  const tok = await loadToken();
  if (!tok) {
    err(`Login required: run ${style(defaultTheme.accent, 'dirgha auth login')}`);
    return 1;
  }

  // Use the userId from the stored token, or fetch from /api/me as fallback
  let userId = tok.userId;

  if (!userId || userId === 'unknown') {
    try {
      const resp = await fetch(`${gatewayBase()}/api/me`, {
        headers: { 'Authorization': `Bearer ${tok.token}` },
      });
      if (resp.ok) {
        const data = (await resp.json()) as { id?: string };
        if (data.id) userId = data.id;
      }
    } catch { /* fallback to stored userId */ }
  }

  const ref = Buffer.from(userId, 'utf8').toString('base64url');
  const link = `https://dirgha.ai/join?ref=${ref}`;

  print(`${style(defaultTheme.success, '✓')} Your referral link: ${style(defaultTheme.accent, link)}`);
  print(`  New nodes joined via your link earn you 20% of their Credits for 90 days.`);
  return 0;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

const HELP = [
  'Usage:',
  '  dirgha node start     Start the node daemon (Ctrl+C to stop)',
  '  dirgha node start --detach   Start daemon in background (detached)',
  '  dirgha node stop      Signal a running daemon to stop',
  '  dirgha node status    Show PID and uptime of the running daemon',
  '  dirgha node invite    Generate a referral link (20% bonus for 90 days)',
  '',
  'Earn Dirgha Credits automatically while your machine is idle.',
  'Credits unlock premium model access (1 Credit/min while running).',
].join('\n');

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const nodeSubcommand: Subcommand = {
  name: 'node',
  description: 'Run a background daemon to earn Dirgha Credits from idle compute',
  async run(argv): Promise<number> {
    const op = argv[0] ?? 'help';

    if (op === 'help' || op === '-h' || op === '--help') {
      stdout.write(HELP + '\n');
      return 0;
    }
    if (op === 'start')  return runStart(argv.includes('--detach'));
    if (op === 'stop')   return runStop();
    if (op === 'status') return runStatus();
    if (op === 'invite') return runInvite();

    err(`Unknown subcommand "${op}".\n${HELP}`);
    return 2;
  },
};
