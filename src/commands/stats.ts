/**
 * commands/stats.ts — `dirgha stats`
 * Usage statistics with box-drawing table output (OpenCode-style).
 */
import chalk from 'chalk';
import { getDB } from '../session/db.js';

// ── Box drawing ──────────────────────────────────────────────────────────────

const W = 50; // visible chars between the two │ borders

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function box(title?: string): string {
  if (!title) return `┌${'─'.repeat(W)}┐`;
  const inner = ` ${title} `;
  const pad = W - inner.length;
  const l = Math.floor(pad / 2);
  const r = pad - l;
  return `┌${'─'.repeat(l)}${inner}${'─'.repeat(r)}┐`;
}
const div = `├${'─'.repeat(W)}┤`;
const bot = `└${'─'.repeat(W)}┘`;

/** One table row: label left-aligned, value right-aligned. Both may include ANSI. */
function row(label: string, value: string): string {
  const vis = stripAnsi(value).length;
  const pad = W - 1 - stripAnsi(label).length - vis; // 1 = leading space
  return `│ ${label}${' '.repeat(Math.max(0, pad))}${value}│`;
}

/** Sub-row (indented label) */
function sub(label: string, value: string): string {
  return row(`  ${chalk.dim(label)}`, chalk.dim(value));
}

// ── Queries ──────────────────────────────────────────────────────────────────

interface Overview {
  sessions: number; messages: number;
  totalIn: number; totalOut: number;
  totalCost: number; totalTools: number;
}
interface ModelStat { model: string; uses: number; cost: number; }
interface ToolStat  { tool_name: string; uses: number; avgMs: number; }
interface SessionRow { id: string; title: string; model: string; tokens: number; updated_at: string; }

function getOverview(db: import('better-sqlite3').Database): Overview {
  const sessions = (db.prepare('SELECT COUNT(*) as n FROM sessions').get() as { n: number }).n;
  const messages = (db.prepare('SELECT COUNT(*) as n FROM messages').get() as { n: number }).n;
  const u = db.prepare(`
    SELECT COALESCE(SUM(input_tokens),0) as inp, COALESCE(SUM(output_tokens),0) as out,
           COALESCE(SUM(cost_usd),0) as cost, COALESCE(SUM(tool_calls),0) as tools
    FROM usage_records
  `).get() as { inp: number; out: number; cost: number; tools: number } | undefined;
  return { sessions, messages, totalIn: u?.inp ?? 0, totalOut: u?.out ?? 0, totalCost: u?.cost ?? 0, totalTools: u?.tools ?? 0 };
}

function getTopModels(db: import('better-sqlite3').Database): ModelStat[] {
  return db.prepare(`SELECT model, COUNT(*) as uses, COALESCE(SUM(cost_usd),0) as cost
    FROM usage_records GROUP BY model ORDER BY uses DESC LIMIT 5`).all() as ModelStat[];
}

function getTopTools(db: import('better-sqlite3').Database): ToolStat[] {
  return db.prepare(`SELECT tool_name, COUNT(*) as uses, COALESCE(AVG(duration_ms),0) as avgMs
    FROM tool_usage GROUP BY tool_name ORDER BY uses DESC LIMIT 8`).all() as ToolStat[];
}

function getRecent(db: import('better-sqlite3').Database): SessionRow[] {
  return db.prepare(`SELECT id, title, model, tokens, updated_at
    FROM sessions ORDER BY updated_at DESC LIMIT 5`).all() as SessionRow[];
}

// ── Formatting ───────────────────────────────────────────────────────────────

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M tok`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k tok`;
  return `${n} tok`;
}

function fmtCost(usd: number): string {
  if (usd === 0)       return chalk.dim('—');
  if (usd < 0.001)     return chalk.dim('<$0.001');
  return `$${usd.toFixed(3)}`;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso.slice(0, 10); }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function statsCommand(): void {
  let db: import('better-sqlite3').Database;
  try { db = getDB(); }
  catch {
    console.log(chalk.yellow('\n  No data yet — start a session with: dirgha\n'));
    return;
  }

  const ov = getOverview(db);
  const models = getTopModels(db);
  const tools  = getTopTools(db);
  const recent = getRecent(db);
  const total  = ov.totalIn + ov.totalOut;

  console.log();

  // ── Overview ─────────────────────────────────────────────────────────────
  console.log(box('OVERVIEW'));
  console.log(row('Sessions',     chalk.cyan(String(ov.sessions))));
  console.log(row('Messages',     chalk.cyan(String(ov.messages))));
  console.log(row('Total tokens', chalk.cyan(fmtTok(total))));
  console.log(sub('Input',        fmtTok(ov.totalIn)));
  console.log(sub('Output',       fmtTok(ov.totalOut)));
  console.log(row('Total cost',   fmtCost(ov.totalCost)));
  console.log(row('Tool calls',   chalk.cyan(String(ov.totalTools))));
  console.log(bot);
  console.log();

  // ── Top models ────────────────────────────────────────────────────────────
  if (models.length > 0) {
    console.log(box('TOP MODELS'));
    for (const m of models) {
      const name = m.model.split('/').pop()?.slice(0, 30) ?? m.model;
      const cost = fmtCost(m.cost);
      const uses = chalk.cyan(String(m.uses));
      // left: name  right: uses  cost
      const right = `${uses} ${cost}`;
      const rightVis = stripAnsi(right);
      const pad = W - 1 - name.length - rightVis.length;
      console.log(`│ ${name}${' '.repeat(Math.max(1, pad))}${right}│`);
    }
    console.log(bot);
    console.log();
  }

  // ── Top tools ─────────────────────────────────────────────────────────────
  if (tools.length > 0) {
    console.log(box('TOP TOOLS'));
    for (const t of tools) {
      const name = t.tool_name.slice(0, 24);
      const ms   = t.avgMs > 0 ? chalk.dim(` ${Math.round(t.avgMs)}ms`) : '';
      const msV  = t.avgMs > 0 ? ` ${Math.round(t.avgMs)}ms` : '';
      const calls = chalk.cyan(String(t.uses));
      const right = `${calls} calls${ms}`;
      const rightVis = `${t.uses} calls${msV}`;
      const pad = W - 1 - name.length - rightVis.length;
      console.log(`│ ${name}${' '.repeat(Math.max(1, pad))}${right}│`);
    }
    console.log(bot);
    console.log();
  }

  // ── Recent sessions ───────────────────────────────────────────────────────
  if (recent.length > 0) {
    console.log(box('RECENT SESSIONS'));
    for (const s of recent) {
      const title  = (s.title || s.id.slice(0, 8)).slice(0, 32);
      const tokStr = chalk.cyan(fmtTok(s.tokens ?? 0));
      const tokVis = fmtTok(s.tokens ?? 0);
      const titlePad = W - 1 - title.length - tokVis.length;
      console.log(`│ ${chalk.bold(title)}${' '.repeat(Math.max(1, titlePad))}${tokStr}│`);
      const model = (s.model.split('/').pop() ?? '').slice(0, 22);
      const date  = chalk.dim(fmtDate(s.updated_at));
      const meta  = `${chalk.dim(s.id.slice(0, 8))}  ${chalk.dim(model)}`;
      const metaVis = `${s.id.slice(0, 8)}  ${model}  ${fmtDate(s.updated_at)}`;
      const dateStr = `  ${date}`;
      const metaPad = W - 1 - stripAnsi(meta).length - stripAnsi(dateStr).length;
      console.log(`│ ${meta}${' '.repeat(Math.max(1, metaPad))}${dateStr}│`);
    }
    console.log(bot);
    console.log();
  }

  if (ov.sessions === 0 && models.length === 0) {
    console.log(chalk.dim('  No usage data yet. Start chatting to see stats.\n'));
  }
}
