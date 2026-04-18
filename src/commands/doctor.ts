/**
 * commands/doctor.ts — `dirgha doctor`
 *
 * System health check: API key, DB, gateway connectivity, Node version, disk.
 * Prints ✓ / ✗ for each check in OpenCode-style box.
 */
import chalk from 'chalk';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { Command } from 'commander';

const MIN_NODE = 18;

// ── Box drawing ───────────────────────────────────────────────────────────────

const W = 52;
const top = `┌${'─'.repeat(W)}┐`;
const bot = `└${'─'.repeat(W)}┘`;
const div = `├${'─'.repeat(W)}┤`;

function row(label: string, status: 'ok' | 'warn' | 'fail', detail?: string): void {
  const icon  = status === 'ok' ? chalk.green('✓') : status === 'warn' ? chalk.yellow('⚠') : chalk.red('✗');
  const color = status === 'ok' ? chalk.green  : status === 'warn' ? chalk.yellow : chalk.red;
  const lbl   = label.padEnd(28);
  const det   = detail ? chalk.dim(detail.slice(0, W - 32)) : '';
  console.log(`│ ${icon} ${color(lbl)}${det.padEnd(W - 32 - det.replace(/\x1b\[[0-9;]*m/g, '').length + det.replace(/\x1b\[[0-9;]*m/g, '').length)} │`);
}

function section(title: string): void {
  const inner = ` ${title} `;
  const pad   = W - inner.length;
  const l = Math.floor(pad / 2);
  const r = pad - l;
  console.log(`├${'─'.repeat(l)}${inner}${'─'.repeat(r)}┤`);
}

// ── Checks ────────────────────────────────────────────────────────────────────

async function checkNode(): Promise<void> {
  const major = parseInt(process.version.slice(1));
  if (major >= MIN_NODE) {
    row('Node.js', 'ok', process.version);
  } else {
    row('Node.js', 'fail', `${process.version} — need ≥ v${MIN_NODE}`);
  }
}

async function checkApiKey(): Promise<void> {
  const { isConfigured } = await import('../utils/credentials.js');
  const { getActiveProvider } = await import('../providers/detection.js');
  if (isConfigured()) {
    const prov = getActiveProvider();
    row('API key', 'ok', prov ?? 'configured');
  } else {
    row('API key', 'fail', 'run: dirgha auth  or  dirgha keys set ...');
  }
}

async function checkCredentials(): Promise<void> {
  const { isLoggedIn, readCredentials } = await import('../utils/credentials.js');
  if (isLoggedIn()) {
    const creds = readCredentials();
    const email = creds?.email ?? 'logged in';
    row('Dirgha account', 'ok', email);
  } else {
    row('Dirgha account', 'warn', 'not logged in (run: dirgha login)');
  }
}

async function checkDB(): Promise<void> {
  try {
    const { getDB } = await import('../session/db.js');
    const db = getDB();
    db.prepare('SELECT 1').get();
    row('SQLite DB', 'ok', '~/.dirgha/dirgha.db');
  } catch (e: any) {
    row('SQLite DB', 'fail', e?.message?.slice(0, 40) ?? 'error');
  }
}

async function checkGateway(): Promise<void> {
  try {
    const res = await fetch('https://api.dirgha.ai/health', {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      row('Gateway', 'ok', 'api.dirgha.ai');
    } else {
      row('Gateway', 'warn', `status ${res.status}`);
    }
  } catch {
    row('Gateway', 'warn', 'offline (local mode still works)');
  }
}

async function checkDisk(): Promise<void> {
  const dir = path.join(os.homedir(), '.dirgha');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const testFile = path.join(dir, '.write-test');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    row('Write access', 'ok', dir);
  } catch {
    row('Write access', 'fail', `cannot write to ${dir}`);
  }
}

async function checkPlaywright(): Promise<void> {
  const candidates = [
    '/usr/lib/node_modules/@playwright/mcp/node_modules/playwright-core',
    '/usr/local/lib/node_modules/playwright-core',
    path.join(process.cwd(), 'node_modules', 'playwright-core'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      row('Playwright', 'ok', 'dirgha capture ready');
      return;
    }
  }
  row('Playwright', 'warn', 'install: npm i -g @playwright/mcp');
}

// ── Main ──────────────────────────────────────────────────────────────────────

export const doctorCommand = new Command('doctor')
  .description('Run system health checks (API key, DB, gateway, tools)')
  .action(async () => {
    console.log();
    console.log(top);
    const title = ' DIRGHA DOCTOR ';
    const pad = W - title.length;
    console.log(`│${' '.repeat(Math.floor(pad / 2))}${chalk.bold(title)}${' '.repeat(Math.ceil(pad / 2))}│`);
    console.log(div);

    section('Environment');
    await checkNode();
    await checkDisk();

    section('Authentication');
    await checkApiKey();
    await checkCredentials();

    section('Services');
    await checkDB();
    await checkGateway();

    section('Tools');
    await checkPlaywright();

    console.log(bot);
    console.log();
    console.log(chalk.dim('  Run `dirgha auth` to configure a provider key.'));
    console.log(chalk.dim('  Run `dirgha login` to connect your Dirgha account.'));
    console.log();
  });
