// @ts-nocheck
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import os from 'os';

interface SlashCommand {
  name?: string;
  description: string;
  args?: string;
  category?: string;
  aliases?: string[];
  handler?: (...args: any[]) => string | void | Promise<string | void>;
}

const WIDTH = 54;

const boxTop = () => '┌' + '─'.repeat(WIDTH - 2) + '┐';
const boxMid = () => '├' + '─'.repeat(WIDTH - 2) + '┤';
const boxBot = () => '└' + '─'.repeat(WIDTH - 2) + '┘';

function row(label: string, status: 'ok' | 'warn' | 'fail', detail?: string): string {
  const statusColor = status === 'ok' ? chalk.green : status === 'warn' ? chalk.yellow : chalk.red;
  const symbol = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✗';
  const symbolStr = statusColor(symbol);
  const labelStr = label.padEnd(26);
  const detailStr = detail ? chalk.dim(detail.slice(0, WIDTH - 32)) : '';
  const raw = `  ${symbolStr} ${labelStr} ${detailStr}`;
  const visLen = chalk.stripColor(raw).length;
  const pad = Math.max(0, WIDTH - 1 - visLen);
  return '│' + raw + ' '.repeat(pad) + '│';
}

function section(title: string): string {
  const inner = ` ${title} `;
  const pad = WIDTH - 2 - inner.length;
  const l = Math.floor(pad / 2);
  const r = pad - l;
  return '├' + '─'.repeat(l) + inner + '─'.repeat(r) + '┤';
}

async function runVerify(): Promise<string> {
  const lines: string[] = [];
  let passed = 0;
  let total = 0;

  const add = (label: string, status: 'ok' | 'warn' | 'fail', detail?: string) => {
    lines.push(row(label, status, detail));
    total++;
    if (status === 'ok') passed++;
  };

  lines.push(boxTop());
  const title = ' DIRGHA VERIFY ';
  const pad = WIDTH - 2 - title.length;
  lines.push('│' + ' '.repeat(Math.floor(pad / 2)) + chalk.bold(title) + ' '.repeat(Math.ceil(pad / 2)) + '│');

  // ── Environment ───────────────────────────────────────────────────────────
  lines.push(section('Environment'));
  const nodeVer = process.version;
  const major = parseInt(nodeVer.slice(1).split('.')[0]);
  add('Node.js', major >= 18 ? 'ok' : 'fail', nodeVer);

  try {
    const dir = path.join(os.homedir(), '.dirgha');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const test = path.join(dir, '.verify_test');
    fs.writeFileSync(test, 'test');
    fs.unlinkSync(test);
    add('Disk access', 'ok', '~/.dirgha writable');
  } catch {
    add('Disk access', 'fail', '~/.dirgha not writable');
  }

  // ── Authentication ────────────────────────────────────────────────────────
  lines.push(section('Authentication'));
  const providerEnvs: [string, string][] = [
    ['ANTHROPIC_API_KEY', 'anthropic'], ['FIREWORKS_API_KEY', 'fireworks'],
    ['OPENAI_API_KEY', 'openai'], ['OPENROUTER_API_KEY', 'openrouter'],
    ['XAI_API_KEY', 'xai'], ['GROQ_API_KEY', 'groq'],
    ['MISTRAL_API_KEY', 'mistral'], ['GOOGLE_API_KEY', 'google'],
  ];
  const activeProvider = providerEnvs.find(([k]) => process.env[k]);
  add('Provider key', activeProvider ? 'ok' : 'warn', activeProvider ? activeProvider[1] : 'none — run /keys set');

  try {
    const { isLoggedIn, readCredentials } = await import('../../utils/credentials.js');
    if (isLoggedIn()) {
      const creds = readCredentials();
      add('Dirgha account', 'ok', creds?.email ?? 'logged in');
    } else {
      add('Dirgha account', 'warn', 'run: dirgha login');
    }
  } catch {
    add('Dirgha account', 'warn', 'could not check');
  }

  // ── Services ──────────────────────────────────────────────────────────────
  lines.push(section('Services'));
  try {
    const { getDB } = await import('../../session/db.js');
    getDB().prepare('SELECT 1').get();
    add('SQLite DB', 'ok', '~/.dirgha/dirgha.db');
  } catch (e: any) {
    add('SQLite DB', 'fail', e?.message?.slice(0, 30) ?? 'error');
  }

  try {
    const res = await fetch('https://api.dirgha.ai/health', { signal: AbortSignal.timeout(4000) });
    add('Gateway', res.ok ? 'ok' : 'warn', res.ok ? 'api.dirgha.ai online' : `status ${res.status}`);
  } catch {
    add('Gateway', 'warn', 'offline (local mode ok)');
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  lines.push(section('Skills'));
  const BUILTIN_SKILLS = ['spec', 'plan', 'qa', 'tdd', 'debug', 'arch', 'review', 'soul', 'anthropic', 'design', 'scale'];
  const skillsDirs = [
    path.join(process.cwd(), 'src/skills/builtin'),
    path.join(process.cwd(), 'src/skills/built-in'),
    path.join(os.homedir(), '.dirgha/skills'),
  ];
  const foundSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const skill of BUILTIN_SKILLS) {
    const found = skillsDirs.some(d =>
      fs.existsSync(path.join(d, `${skill}.md`)) || fs.existsSync(path.join(d, skill))
    );
    if (found) foundSkills.push(skill);
    else missingSkills.push(skill);
  }
  add('Builtin skills', missingSkills.length === 0 ? 'ok' : 'warn',
    `${foundSkills.length}/${BUILTIN_SKILLS.length} found${missingSkills.length ? ` · missing: ${missingSkills.slice(0, 3).join(', ')}` : ''}`);

  // User skills in ~/.claude/skills
  try {
    const claudeSkillsDir = path.join(os.homedir(), '.claude/skills');
    if (fs.existsSync(claudeSkillsDir)) {
      const entries = fs.readdirSync(claudeSkillsDir, { withFileTypes: true })
        .filter(e => e.isDirectory()).map(e => e.name);
      add('User skills', 'ok', `${entries.length} in ~/.claude/skills: ${entries.slice(0, 4).join(', ')}`);
    } else {
      add('User skills', 'warn', '~/.claude/skills not found');
    }
  } catch {
    add('User skills', 'warn', 'could not read');
  }

  // ── Tools ─────────────────────────────────────────────────────────────────
  lines.push(section('Tools'));
  const pwPaths = [
    path.join(process.cwd(), 'node_modules/@playwright/mcp'),
    '/usr/lib/node_modules/@playwright/mcp',
    '/usr/local/lib/node_modules/@playwright/mcp',
  ];
  add('Playwright MCP', pwPaths.some(p => fs.existsSync(p)) ? 'ok' : 'warn',
    pwPaths.some(p => fs.existsSync(p)) ? 'ready' : 'npm i -g @playwright/mcp');

  try {
    const { mcpManager } = await import('../../mcp/manager.js');
    const servers = mcpManager.getConnectedServers?.() ?? [];
    add('MCP servers', 'ok', `${servers.length} connected`);
  } catch {
    add('MCP servers', 'warn', 'none connected');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  lines.push(boxMid());
  const allOk = passed === total;
  const summaryStatus = allOk ? 'ok' : passed >= total * 0.7 ? 'warn' : 'fail';
  add(`${passed}/${total} checks passed`, summaryStatus, allOk ? 'all systems go' : 'see warnings above');
  lines.push(boxBot());

  return '\n' + lines.join('\n') + '\n';
}

export const verifyCommands: SlashCommand[] = [
  {
    name: 'verify',
    description: 'Comprehensive system + skills health check',
    category: 'session',
    handler: async () => runVerify(),
  },
  {
    name: 'doctor',
    description: 'System health check (environment, auth, services, skills, tools)',
    category: 'session',
    aliases: ['health', 'check'],
    handler: async () => runVerify(),
  },
];
