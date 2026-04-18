// @ts-nocheck

/**
 * repl/slash/session.ts — Session management commands
 */
import chalk from 'chalk';
import { getTheme } from '../themes.js';
import type { SlashCommand, ReplContext } from './types.js';

export const sessionCommands: SlashCommand[] = [
  {
    name: 'help',
    description: 'Show all available commands',
    category: 'session',
    handler: (_args, _ctx, registry) => {
      const t = getTheme();
      const byCategory = new Map<string, SlashCommand[]>();
      for (const cmd of registry) {
        const cat = cmd.category;
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(cmd);
      }
      let out = '\n';
      for (const [cat, cmds] of byCategory) {
        out += t.header(`  ${cat.toUpperCase()}\n`);
        for (const cmd of cmds) {
          const name = t.primary(`/${cmd.name}${cmd.args ? ' ' + cmd.args : ''}`);
          const aliases = cmd.aliases ? t.dim(` (${cmd.aliases.map(a => `/${a}`).join(', ')})`) : '';
          out += `    ${name}${aliases}  ${chalk.white(cmd.description)}\n`;
        }
        out += '\n';
      }
      return out;
    },
  },
  {
    name: 'status',
    description: 'Show session info: model, tokens, credits, mode',
    category: 'session',
    handler: (_args, ctx) => {
      const t = getTheme();
      const lines = [
        '',
        `  ${t.dim('Session')}  ${t.primary(ctx.sessionId)}`,
        `  ${t.dim('Model')}    ${ctx.model}`,
        `  ${t.dim('Tokens')}   ${ctx.totalTokens.toLocaleString()} used`,
        `  ${t.dim('Tools')}    ${ctx.toolCallCount} calls this session`,
        `  ${t.dim('Plan')}     ${ctx.isPlanMode ? t.warning('ACTIVE (read-only)') : chalk.dim('off')}`,
        `  ${t.dim('Yolo')}     ${ctx.isYolo ? t.error('ACTIVE (no prompts)') : chalk.dim('off')}`,
        `  ${t.dim('Theme')}    ${ctx.activeTheme}`,
        `  ${t.dim('Perms')}    ${ctx.permissionLevel}`,
        '',
      ];
      return lines.join('\n');
    },
  },
  {
    name: 'clear',
    description: 'Clear screen and conversation history',
    category: 'session',
    handler: (_args, ctx) => {
      ctx.messages.length = 0;
      ctx.totalTokens = 0;
      ctx.toolCallCount = 0;
      process.stdout.write('\x1B[2J\x1B[H'); // clear terminal screen + move cursor home
      return chalk.dim('History cleared.');
    },
  },
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    description: 'Exit dirgha (same as Ctrl+C)',
    category: 'session',
    handler: () => {
      // Give the line a moment to print, then exit cleanly.
      setTimeout(() => process.exit(0), 10);
      return chalk.dim('Goodbye.');
    },
  },
  {
    name: 'clear-input',
    aliases: ['ci'],
    description: 'Clear the input field (same as Esc or Ctrl+K)',
    category: 'session',
    handler: () => chalk.dim('Input cleared. (Esc or Ctrl+K works too.)'),
  },
  {
    name: 'recap',
    description: 'Summary of this session: goals, tools used, files touched, cost',
    category: 'session',
    handler: (_args, ctx) => {
      const t = getTheme();
      const msgs = ctx.messages ?? [];
      if (msgs.length === 0) return chalk.dim('\n  Nothing to recap yet. Send a prompt first.\n');

      // Extract user prompts (goals)
      const userPrompts: string[] = [];
      // Count tools + files touched
      const toolCounts = new Map<string, number>();
      const filesTouched = new Set<string>();

      for (const m of msgs) {
        if (m.role === 'user' && typeof m.content === 'string') {
          const txt = m.content.trim();
          if (txt && !txt.startsWith('[tool_result')) userPrompts.push(txt);
        }
        if (m.role === 'assistant' && Array.isArray(m.content)) {
          for (const block of m.content) {
            if ((block as any).type === 'tool_use') {
              const name = (block as any).name ?? 'unknown';
              toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
              const input = (block as any).input ?? {};
              const path = input.path ?? input.file_path ?? input.filepath;
              if (typeof path === 'string' && path.length < 200) filesTouched.add(path);
            }
          }
        }
      }

      const topTools = [...toolCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([n, c]) => `${n}×${c}`)
        .join(', ');
      const totalToolCalls = [...toolCounts.values()].reduce((a, b) => a + b, 0);

      // Cost: use real billing if available, else the /cost heuristic
      const inputCost = (ctx.totalTokens * 0.8) / 1_000_000 * 3;
      const outputCost = (ctx.totalTokens * 0.2) / 1_000_000 * 15;
      const cost = (inputCost + outputCost).toFixed(4);

      const firstGoal = userPrompts[0] ?? '(none)';
      const latestGoal = userPrompts[userPrompts.length - 1] ?? '(none)';
      const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s;

      const lines = [
        '',
        t.header('  ※ Session recap'),
        '',
        `  ${t.dim('Session  ')} ${t.primary(ctx.sessionId ?? '—')}`,
        `  ${t.dim('Model    ')} ${ctx.model ?? '—'}`,
        `  ${t.dim('Prompts  ')} ${userPrompts.length}   ·   messages: ${msgs.length}`,
        `  ${t.dim('Tokens   ')} ${ctx.totalTokens.toLocaleString()}   ·   est. $${cost}`,
        `  ${t.dim('Tools    ')} ${totalToolCalls} calls   ${topTools ? t.dim('(' + topTools + ')') : ''}`,
        `  ${t.dim('Files    ')} ${filesTouched.size} touched${filesTouched.size > 0 && filesTouched.size <= 6
          ? '  ' + t.dim([...filesTouched].map(f => f.split('/').slice(-2).join('/')).join(', '))
          : ''}`,
        '',
        `  ${t.dim('First    ')} ${truncate(firstGoal, 90)}`,
        ...(userPrompts.length > 1 ? [`  ${t.dim('Latest   ')} ${truncate(latestGoal, 90)}`] : []),
        '',
      ];
      return lines.join('\n');
    },
  },
  {
    name: 'compact',
    description: 'Summarize and compress conversation history',
    category: 'session',
    handler: (_args, ctx) => {
      if (ctx.messages.length <= 4) return chalk.dim('Nothing to compact.');
      const kept = ctx.messages.slice(-4);
      const removed = ctx.messages.length - 4;
      ctx.messages.splice(0, ctx.messages.length, ...kept);
      return chalk.dim(`Compacted: kept last 4 messages, removed ${removed}.`);
    },
  },
  {
    name: 'cost',
    description: 'Estimate session cost in USD',
    category: 'session',
    handler: (_args, ctx) => {
      const inputCost = (ctx.totalTokens * 0.8) / 1_000_000 * 3;
      const outputCost = (ctx.totalTokens * 0.2) / 1_000_000 * 15;
      const total = (inputCost + outputCost).toFixed(4);
      return chalk.dim(`Estimated cost: ~$${total} (${ctx.totalTokens.toLocaleString()} tokens)`);
    },
  },
  {
    name: 'tokens',
    description: 'Show token usage this session',
    category: 'session',
    handler: (_args, ctx) => chalk.dim(`Tokens used: ${ctx.totalTokens.toLocaleString()}`),
  },
  {
    name: 'tools',
    description: 'List all available tools',
    category: 'session',
    handler: async (_args, ctx) => {
      const { TOOL_DEFINITIONS } = await import('../../agent/tools.js');
      const t = getTheme();
      const mode = ctx.isPlanMode ? ' (write tools disabled in plan mode)' : '';
      let out = `\n  ${t.header('Available Tools')}${t.dim(mode)}\n\n`;
      for (const tool of TOOL_DEFINITIONS) {
        out += `  ${t.primary(tool.name.padEnd(18))} ${chalk.dim(tool.description)}\n`;
      }
      return out + '\n';
    },
  },
  {
    name: 'version',
    description: 'Show CLI version',
    category: 'session',
    handler: () => chalk.dim('Dirgha CLI v2.0.0'),
  },
  {
    name: 'btw',
    description: 'Ask an ephemeral question (not saved to history)',
    args: '<question>',
    category: 'session',
    handler: async (args, ctx) => {
      if (!args.trim()) return chalk.dim('Usage: /btw <question>');
      const { runAgentLoop } = await import('../../agent/loop.js');
      let output = '';
      await runAgentLoop(
        args.trim(),
        [], // empty history — ephemeral
        ctx.model,
        (t) => { output += t; },
        () => {},
        ctx,
      );
      return output || chalk.dim('(no response)');
    },
  },
  {
    name: 'save',
    description: 'Save current session to disk',
    args: '[name]',
    category: 'session',
    handler: async (args, ctx) => {
      const { saveSession, saveDBSession } = await import('../../session/persistence.js');
      const name = args.trim() || undefined;
      const id = await saveSession(ctx, name);
      await saveDBSession(ctx, name);
      return chalk.green(`✓ Session saved: ${id.slice(0, 8)}`);
    },
  },
  {
    name: 'list',
    description: 'List all saved sessions',
    category: 'session',
    handler: async () => {
      const { listSessions, listDBSessions } = await import('../../session/persistence.js');
      const fileSessions = listSessions();
      const dbSessions = listDBSessions();
      
      // Merge and dedupe
      const allSessions = [...fileSessions];
      for (const s of dbSessions) {
        if (!allSessions.find(f => f.id === s.id)) allSessions.push(s);
      }
      
      allSessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      if (!allSessions.length) return chalk.dim('No saved sessions.');
      
      const t = getTheme();
      let out = '\n' + t.header('Saved Sessions') + '\n';
      for (const s of allSessions.slice(0, 20)) {
        const date = new Date(s.createdAt).toLocaleDateString();
        out += `  ${t.primary(s.id.slice(0, 8))} ${chalk.gray('│')} ${s.title} ${chalk.gray('│')} ${t.secondary(date)} ${chalk.gray('│')} ${s.model || 'unknown'}\n`;
      }
      if (allSessions.length > 20) out += t.secondary(`  ... and ${allSessions.length - 20} more\n`);
      return out;
    },
  },
  {
    name: 'load',
    description: 'Load a saved session by ID',
    args: '<session-id>',
    category: 'session',
    handler: async (args, ctx) => {
      const { loadSession, loadDBSession } = await import('../../session/persistence.js');
      const id = args.trim();
      if (!id) return chalk.red('Usage: /load <session-id>');
      
      const session = loadSession(id) || loadDBSession(id);
      if (!session) return chalk.red(`Session not found: ${id}`);
      
      ctx.messages.splice(0, ctx.messages.length, ...session.messages);
      ctx.model = session.model;
      ctx.totalTokens = session.tokensUsed;
      return chalk.green(`✓ Loaded session: ${session.title} (${session.messages.length} messages)`);
    },
  },
  {
    name: 'delete',
    description: 'Delete a saved session by ID',
    args: '<session-id>',
    category: 'session',
    handler: async (args) => {
      const { deleteSession, deleteDBSession } = await import('../../session/persistence.js');
      const id = args.trim();
      if (!id) return chalk.red('Usage: /delete <session-id>');
      
      const deleted = deleteSession(id) || deleteDBSession(id);
      if (!deleted) return chalk.red(`Session not found: ${id}`);
      return chalk.green(`✓ Deleted session: ${id.slice(0, 8)}`);
    },
  },
  {
    name: 'resume',
    description: 'Restore a saved session (alias for /load)',
    args: '[session-id]',
    category: 'session',
    handler: async (args, ctx) => {
      const { loadSession, loadDBSession, listSessions, listDBSessions } = await import('../../session/persistence.js');
      if (!args.trim()) {
        const fileSessions = listSessions();
        const dbSessions = listDBSessions();
        const allSessions = [...fileSessions];
        for (const s of dbSessions) {
          if (!allSessions.find(f => f.id === s.id)) allSessions.push(s);
        }
        allSessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        if (!allSessions.length) return chalk.dim('No saved sessions.');
        const t = getTheme();
        let out = '\n  Saved sessions:\n';
        for (const s of allSessions.slice(-10)) {
          out += `  ${t.primary(s.id.slice(0, 8))}  ${t.dim(s.createdAt.slice(0, 16))}  ${s.model}  ${s.title}\n`;
        }
        return out;
      }
      const session = loadSession(args.trim()) || loadDBSession(args.trim());
      if (!session) return chalk.red(`Session not found: ${args.trim()}`);
      ctx.messages.splice(0, ctx.messages.length, ...session.messages);
      ctx.model = session.model;
      ctx.totalTokens = session.tokensUsed;
      return chalk.green(`✓ Resumed session: ${session.title} (${session.messages.length} messages)`);
    },
  },
  {
    name: 'export',
    description: 'Export conversation as md|html|json [path]',
    args: '[md|html|json] [path]',
    category: 'session',
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const fmt  = (['md', 'html', 'json'] as const).includes(parts[0] as any) ? (parts[0] as 'md' | 'html' | 'json') : 'md';
      const ts   = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
      const defaultFile = `dirgha-export-${ts}.${fmt}`;
      const outPath = parts[1] ?? defaultFile;
      const { writeFileSync } = await import('fs');
      const msgs = ctx.messages ?? [];

      if (fmt === 'json') {
        writeFileSync(outPath, JSON.stringify(msgs, null, 2), 'utf8');
      } else if (fmt === 'html') {
        const extractText = (c: unknown): string => {
          if (typeof c === 'string') { try { const p = JSON.parse(c); if (Array.isArray(p)) return p.filter((b:any)=>b?.type==='text').map((b:any)=>b.text??'').join('\n')||c; } catch{} return c; }
          if (Array.isArray(c)) return (c as any[]).filter(b=>b?.type==='text').map(b=>b.text??'').join('\n');
          return JSON.stringify(c);
        };
        const rows = msgs.map(m => {
          const role    = String(m.role ?? '');
          const content = extractText(m.content)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const cls = role === 'user' ? 'user' : role === 'assistant' ? 'assistant' : 'system';
          return `<div class="msg ${cls}"><span class="role">${role}</span><pre>${content}</pre></div>`;
        }).join('\n');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Dirgha Export ${ts}</title>
<style>
body{background:#111;color:#e5e7eb;font-family:monospace;max-width:860px;margin:40px auto;padding:0 20px}
.msg{margin:16px 0;border-left:3px solid #374151;padding-left:12px}
.msg.user{border-color:#3b82f6}.msg.assistant{border-color:#22c55e}.msg.system{border-color:#6b7280}
.role{font-size:.75em;color:#6b7280;text-transform:uppercase;letter-spacing:.05em}
pre{margin:4px 0;white-space:pre-wrap;word-break:break-word;color:#e5e7eb}
</style></head><body>
<h1 style="color:#22c55e;font-size:1.2em">◆ DIRGHA — ${ts}</h1>
${rows}
</body></html>`;
        writeFileSync(outPath, html, 'utf8');
      } else {
        const md = msgs
          .map(m => {
            const role    = m.role ?? 'unknown';
            const content = extractText(m.content);
            return `## ${role}\n\n${content}`;
          })
          .join('\n\n---\n\n');
        writeFileSync(outPath, `# Dirgha Export ${ts}\n\n${md}\n`, 'utf8');
      }
      return chalk.green(`✓ Exported (${fmt}) → ${outPath}`);
    },
  },
  {
    name: 'copy',
    description: 'Copy last N assistant replies to clipboard (OSC 52)',
    args: '[n=1|all]',
    category: 'session',
    handler: (args, ctx) => {
      const n = args.trim() === 'all' ? Infinity : parseInt(args.trim() || '1', 10) || 1;
      const msgs = (ctx.messages ?? []).filter(m => m.role === 'assistant');
      const slice = n === Infinity ? msgs : msgs.slice(-n);
      if (!slice.length) return chalk.dim('No assistant messages yet.');
      const text = slice
        .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
        .join('\n\n---\n\n');
      // OSC 52 — writes to terminal clipboard (iTerm2, Ghostty, WezTerm, Windows Terminal)
      const b64 = Buffer.from(text, 'utf8').toString('base64');
      process.stdout.write(`\x1b]52;c;${b64}\x07`);
      return chalk.green(`✓ Copied ${slice.length} message${slice.length !== 1 ? 's' : ''} to clipboard (${text.length} chars)`);
    },
  },
  {
    name: 'credits',
    description: 'Show remaining credits and quota summary',
    category: 'session',
    handler: async () => {
      const { checkQuota, checkRemoteQuota } = await import('../../billing/quota.js');
      const { readProfile } = await import('../../utils/profile.js');
      const tier = readProfile()?.tier ?? 'free';
      const status = checkQuota(tier);
      const t = getTheme();
      const remote = await checkRemoteQuota();
      const lines = [
        '',
        `  ${t.header('Credits & Quota')}`,
        `  ${t.dim('Tier')}     ${t.primary(status.tier)}`,
        `  ${t.dim('Daily')}    ${status.dailyTokens.toLocaleString()} / ${status.dailyLimit.toLocaleString()} tokens`,
        `  ${t.dim('Monthly')}  ${status.monthlyTokens.toLocaleString()} / ${status.monthlyLimit.toLocaleString()} tokens`,
        remote ? `  ${t.dim('Remote')}   ${remote.allowed ? t.success('OK') : t.error('Blocked')}  (${remote.remaining === Infinity ? '∞' : remote.remaining} remaining)` : `  ${t.dim('Remote')}   ${chalk.dim('offline / BYOK')}`,
        status.exceeded ? `  ${t.error('⚠ Quota exceeded — upgrade to continue')}` : '',
        `  ${chalk.dim('Upgrade: https://dirgha.ai/upgrade')}`,
        '',
      ];
      return lines.filter(l => l !== '').join('\n');
    },
  },
  {
    name: 'upgrade',
    description: 'Open upgrade page or show upgrade plans',
    category: 'session',
    handler: async () => {
      const t = getTheme();
      const plans = [
        { name: 'Free',  price: '$0',    daily: '100K tokens',   monthly: '1M tokens',   note: 'Current' },
        { name: 'Pro',   price: '$20/mo', daily: '500K tokens',  monthly: '10M tokens',  note: 'Best for developers' },
        { name: 'Team',  price: '$50/mo', daily: '2M tokens',    monthly: '100M tokens', note: 'Multi-user + priority' },
      ];
      let out = `\n  ${t.header('Upgrade Plans')}\n\n`;
      for (const p of plans) {
        const highlight = p.name === 'Pro' ? t.primary : (s: string) => s;
        out += `  ${highlight(p.name.padEnd(6))}  ${chalk.white(p.price.padEnd(10))}  ${chalk.dim(p.daily.padEnd(14))} / day  ${chalk.dim(p.monthly.padEnd(12))} / month  ${t.dim(p.note)}\n`;
      }
      out += `\n  ${chalk.dim('Upgrade at:')} ${t.primary('https://dirgha.ai/upgrade')}\n\n`;
      // Try to open URL in default browser (best-effort)
      try {
        const { spawnSync } = await import('child_process');
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        spawnSync(cmd, ['https://dirgha.ai/upgrade'], { detached: true, stdio: 'ignore' });
      } catch { /* no-op */ }
      return out;
    },
  },
  {
    name: 'usage',
    description: 'Show billing quota and usage status',
    category: 'session',
    handler: async () => {
      const { checkQuota } = await import('../../billing/quota.js');
      const { readProfile } = await import('../../utils/profile.js');
      const tier = readProfile()?.tier ?? 'free';
      const status = checkQuota(tier);
      const t = getTheme();
      const dailyPct = Math.round((status.dailyTokens / status.dailyLimit) * 100);
      const monthlyPct = Math.round((status.monthlyTokens / status.monthlyLimit) * 100);
      
      const bar = (pct: number, width = 20) => {
        const filled = Math.round((pct / 100) * width);
        const color = pct > 90 ? t.error : pct > 70 ? t.warning : t.success;
        return color('█'.repeat(filled)) + t.dim('░'.repeat(width - filled));
      };
      
      return [
        '',
        `  ${t.header('Usage Quota')}`,
        '',
        `  ${t.dim('Daily')}   ${bar(dailyPct)}  ${dailyPct}%`,
        `  ${t.dim('         ')}${status.dailyTokens.toLocaleString()}/${status.dailyLimit.toLocaleString()} tokens`,
        '',
        `  ${t.dim('Monthly')} ${bar(monthlyPct)}  ${monthlyPct}%`,
        `  ${t.dim('         ')}${status.monthlyTokens.toLocaleString()}/${status.monthlyLimit.toLocaleString()} tokens`,
        '',
        `  Tier: ${t.primary(status.tier)}`,
        status.exceeded ? `  ${t.error('⚠️ Quota exceeded')}` : '',
        '',
      ].join('\n');
    },
  },
];
