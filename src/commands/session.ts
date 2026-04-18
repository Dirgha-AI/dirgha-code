/** session.ts — session list + export subcommands */
import { Command } from 'commander';
import chalk from 'chalk';
import { getDB } from '../session/db.js';

type SessionRow = {
  id: string; title: string; model: string; tokens: number;
  created_at: string; updated_at: string; type: string; working_dir: string;
};
type MessageRow = { role: string; content: string };

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

function exportSession(sessionId: string): void {
  const db = getDB();
  const session = db.prepare(
    `SELECT * FROM sessions WHERE id = ?`
  ).get(sessionId) as SessionRow | undefined;

  if (!session) {
    console.error(chalk.red(`Session not found: ${sessionId}`));
    process.exit(1);
  }

  const messages = db.prepare(
    `SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC`
  ).all(sessionId) as MessageRow[];

  const lines: string[] = [
    `# Session: ${session.title || '(untitled)'}`,
    `*${session.created_at} · ${session.model} · ${fmtTokens(session.tokens)} tokens*`,
    '',
  ];

  for (const msg of messages) {
    const heading = msg.role === 'user' ? '## User' : '## Dirgha';
    lines.push(heading, msg.content, '');
  }

  console.log(lines.join('\n'));
}

function listSessions(): void {
  const db = getDB();
  const rows = db.prepare(
    `SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 20`
  ).all() as SessionRow[];

  if (!rows.length) {
    console.log(chalk.dim('  No sessions yet.\n'));
    return;
  }

  const IDW = 10, DATEW = 20, MODELW = 22, TOKW = 7;
  const header =
    chalk.bold('ID'.padEnd(IDW)) +
    chalk.bold('Created'.padEnd(DATEW)) +
    chalk.bold('Model'.padEnd(MODELW)) +
    chalk.bold('Tokens'.padEnd(TOKW)) +
    chalk.bold('Dir');
  console.log('\n' + header);
  console.log('─'.repeat(IDW + DATEW + MODELW + TOKW + 30));

  for (const r of rows) {
    const id = truncate(r.id, IDW - 1).padEnd(IDW);
    const date = truncate(r.created_at.slice(0, 16).replace('T', ' '), DATEW - 1).padEnd(DATEW);
    const model = truncate(r.model || '—', MODELW - 1).padEnd(MODELW);
    const tok = fmtTokens(r.tokens).padEnd(TOKW);
    const dir = truncate(r.working_dir || '—', 30);
    console.log(chalk.dim(id) + date + chalk.cyan(model) + chalk.yellow(tok) + chalk.dim(dir));
  }
  console.log();
}

export function registerSessionCommands(program: Command): void {
  const session = program.command('session').description('Manage chat sessions');

  session
    .command('list')
    .description('List recent 20 sessions')
    .action(() => listSessions());

  session
    .command('export [sessionId]')
    .description('Export a session as markdown transcript')
    .action((sessionId?: string) => {
      if (!sessionId) {
        console.error(chalk.red('Provide session ID. Use `dirgha session list` to see IDs.'));
        process.exit(1);
      }
      exportSession(sessionId);
    });
}
