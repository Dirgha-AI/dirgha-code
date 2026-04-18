/**
 * repl/slash/dev.ts — Development workflow commands
 */
import type { SlashCommand, ReplContext } from './types.js';

export const devCommands: SlashCommand[] = [
  {
    name: 'todos',
    description: 'Show current session TODO list',
    category: 'dev',
    handler: (_args, ctx) => {
      if (!ctx.todos.length) return chalk.dim('No TODOs yet. Ask the agent to create tasks.');
      const t = getTheme();
      let out = '\n';
      for (const todo of ctx.todos) {
        const check = todo.done ? t.success('✓') : t.dim('○');
        const text = todo.done ? chalk.dim(todo.text) : chalk.white(todo.text);
        out += `  ${check}  ${text}\n`;
      }
      return out;
    },
  },
  {
    name: 'debug',
    description: 'Toggle verbose debug mode (show raw API responses)',
    category: 'dev',
    handler: () => {
      const current = process.env['DIRGHA_DEBUG'] === '1';
      process.env['DIRGHA_DEBUG'] = current ? '0' : '1';
      return chalk.dim(`Debug mode: ${current ? 'off' : 'ON'}`);
    },
  },
  {
    name: 'spec',
    description: 'Activate spec-writing skill for this session turn',
    args: '[topic]',
    category: 'dev',
    handler: async (args, ctx) => {
      const { runAgentLoop } = await import('../../agent/loop.js');
      const { getDefaultModel } = await import('../../agent/gateway.js');
      const model = ctx.model ?? getDefaultModel();
      let accumulated = '';
      await runAgentLoop(
        args.trim() || 'Help me write a spec for what I want to build. Start by asking what I want to build.',
        ctx.messages,
        model,
        (t) => { accumulated += t; process.stdout.write(t); },
        () => {},
        ctx,
        'spec',
      );
      return '';
    },
  },
  {
    name: 'plan',
    description: 'Activate planning skill — write implementation plan from spec',
    args: '[spec-file or topic]',
    category: 'dev',
    handler: async (args, ctx) => {
      const { runAgentLoop } = await import('../../agent/loop.js');
      const { getDefaultModel } = await import('../../agent/gateway.js');
      const model = ctx.model ?? getDefaultModel();
      await runAgentLoop(
        args.trim() || 'Write a detailed implementation plan for the current spec.',
        ctx.messages,
        model,
        (t) => process.stdout.write(t),
        () => {},
        ctx,
        'plan',
      );
      return '';
    },
  },
  {
    name: 'qa',
    description: 'Run QA checklist on recent changes',
    args: '[scope]',
    category: 'dev',
    handler: async (args, ctx) => {
      const { runAgentLoop } = await import('../../agent/loop.js');
      const { getDefaultModel } = await import('../../agent/gateway.js');
      const model = ctx.model ?? getDefaultModel();
      await runAgentLoop(
        args.trim() || 'Run a thorough QA review of the recent changes. Check tests, build, lint, and security.',
        ctx.messages,
        model,
        (t) => process.stdout.write(t),
        () => {},
        ctx,
        'qa',
      );
      return '';
    },
  },
  {
    name: 'scaffold',
    description: 'Scaffold shadcn/ui + Phosphor Icons setup or a component/page/api/form',
    args: '[component|page|api|form|setup] [name]',
    category: 'dev',
    handler: async (args, ctx) => {
      const { runAgentLoop } = await import('../../agent/loop.js');
      const { getDefaultModel } = await import('../../agent/gateway.js');
      const model = ctx.model ?? getDefaultModel();
      const prompt = args.trim()
        ? `Scaffold a ${args.trim()} following the Dirgha design system (shadcn/ui + Phosphor Icons).`
        : 'Help me scaffold my project with shadcn/ui, Phosphor Icons, and Dirgha design tokens.';
      await runAgentLoop(prompt, ctx.messages, model, (t) => process.stdout.write(t), () => {}, ctx, 'scaffold');
      return '';
    },
  },
  {
    name: 'review',
    description: 'Request code review of recent changes',
    args: '[scope]',
    category: 'dev',
    handler: async (args, ctx) => {
      const { runAgentLoop } = await import('../../agent/loop.js');
      const { getDefaultModel } = await import('../../agent/gateway.js');
      const model = ctx.model ?? getDefaultModel();
      await runAgentLoop(
        args.trim() || 'Review the recent code changes for correctness, security, and design quality.',
        ctx.messages,
        model,
        (t) => process.stdout.write(t),
        () => {},
        ctx,
        'review',
      );
      return '';
    },
  },
];

// Lazy imports for chalk and getTheme (to avoid circular deps)
import chalk from 'chalk';
import { getTheme } from '../themes.js';

// Appended after module definition (avoids touching existing exports)
devCommands.push({
  name: 'changes',
  description: 'Show files modified this session',
  category: 'dev',
  handler: async () => {
    const { getSessionChangeSummary } = await import('../../utils/session-cache.js');
    return '\n' + getSessionChangeSummary() + '\n';
  },
});

devCommands.push({
  name: 'vim',
  description: 'Toggle vim keybindings in REPL mode (TUI: visual indicator only)',
  category: 'dev',
  handler: async () => {
    // Toggle DIRGHA_VIM env — picked up by readLine opts in repl/index.ts
    const current = process.env['DIRGHA_VIM'] === '1';
    process.env['DIRGHA_VIM'] = current ? '0' : '1';
    return chalk.dim(`Vim mode: ${current ? 'off' : 'ON'} (takes effect next input in REPL mode)`);
  },
});

// ── Additional slash commands ─────────────────────────────────────────────

devCommands.push({
  name: 'reasoning',
  description: 'Toggle extended thinking / reasoning mode',
  args: '[on|off]',
  category: 'dev',
  handler: (args: string) => {
    const current = process.env['DIRGHA_THINKING'] === '1';
    const next = args === 'on' ? true : args === 'off' ? false : !current;
    process.env['DIRGHA_THINKING'] = next ? '1' : '0';
    return chalk.dim(`Extended thinking: ${next ? 'ON — models that support it will show reasoning' : 'off'}`);
  },
});

devCommands.push({
  name: 'effort',
  description: 'Set reasoning effort: low | medium | high',
  args: '[low|medium|high]',
  category: 'dev',
  handler: (args: string) => {
    const valid = ['low', 'medium', 'high'];
    const level = args?.trim().toLowerCase();
    if (level && valid.includes(level)) {
      process.env['DIRGHA_EFFORT'] = level;
      return chalk.dim(`Reasoning effort: ${level}`);
    }
    const cur = process.env['DIRGHA_EFFORT'] ?? 'medium';
    return chalk.dim(`Current effort: ${cur}${!process.env['DIRGHA_EFFORT'] ? ' (default)' : ''} — use: /effort low|medium|high`);
  },
});

devCommands.push({
  name: 'fast',
  description: 'Toggle brief/fast response mode (concise, no elaboration)',
  category: 'dev',
  handler: (args: string) => {
    const current = process.env['DIRGHA_FAST'] === '1';
    const next = args === 'on' ? true : args === 'off' ? false : !current;
    process.env['DIRGHA_FAST'] = next ? '1' : '0';
    return chalk.dim(`Fast mode: ${next ? 'ON — responses will be brief and direct' : 'off'}`);
  },
});

devCommands.push({
  name: 'summary',
  description: 'AI-generated summary of this conversation',
  category: 'session',
  handler: async (_args: string, ctx: any) => {
    const { runAgentLoop } = await import('../../agent/loop.js');
    const { getDefaultModel } = await import('../../agent/gateway.js');
    const model = ctx?.model ?? getDefaultModel();
    await runAgentLoop(
      'Write a brief 3-5 line summary of what has been accomplished in this conversation.',
      ctx?.messages ?? [],
      model,
      (t: string) => process.stdout.write(t),
      () => {},
      ctx,
    );
    return '';
  },
});

devCommands.push({
  name: 'fix',
  description: 'Auto-fix lint errors, type errors, and test failures',
  args: '[scope]',
  category: 'dev',
  handler: async (args: string, ctx: any) => {
    const { runAgentLoop } = await import('../../agent/loop.js');
    const { getDefaultModel } = await import('../../agent/gateway.js');
    const model = ctx?.model ?? getDefaultModel();
    await runAgentLoop(
      args.trim() || 'Fix all lint errors, type errors, and failing tests in the recent changes. Run tests after fixing.',
      ctx?.messages ?? [],
      model,
      (t: string) => process.stdout.write(t),
      () => {},
      ctx,
      'debug',
    );
    return '';
  },
});

devCommands.push({
  name: 'refactor',
  description: 'Refactor recent code for clarity and maintainability',
  args: '[scope]',
  category: 'dev',
  handler: async (args: string, ctx: any) => {
    const { runAgentLoop } = await import('../../agent/loop.js');
    const { getDefaultModel } = await import('../../agent/gateway.js');
    const model = ctx?.model ?? getDefaultModel();
    await runAgentLoop(
      args.trim() || 'Refactor the recent changes for clarity, remove duplication, and improve maintainability.',
      ctx?.messages ?? [],
      model,
      (t: string) => process.stdout.write(t),
      () => {},
      ctx,
    );
    return '';
  },
});

devCommands.push({
  name: 'cache',
  description: 'Show prompt cache hit statistics for this session',
  category: 'session',
  handler: () => {
    const hits = process.env['DIRGHA_CACHE_HITS'];
    const misses = process.env['DIRGHA_CACHE_MISSES'];
    if (!hits && !misses) return chalk.dim('No cache stats (requires Anthropic with prompt caching)');
    const h = parseInt(hits ?? '0');
    const m = parseInt(misses ?? '0');
    const total = h + m;
    const rate = total > 0 ? Math.round((h / total) * 100) : 0;
    return chalk.dim(`Cache — hits: ${h}  misses: ${m}  rate: ${rate}%`);
  },
});

devCommands.push({
  name: 'workspace',
  description: 'Show workspace: directory, git branch, project type',
  category: 'session',
  handler: () => {
    const { spawnSync } = require('child_process');
    const { existsSync } = require('fs');
    const cwd = process.cwd();
    let branch = 'unknown';
    try {
      const r = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8', cwd });
      if (r.status === 0 && r.stdout?.trim()) branch = r.stdout.trim();
    } catch { /* noop */ }
    const type = existsSync(`${cwd}/package.json`) ? 'Node.js'
      : existsSync(`${cwd}/pyproject.toml`) ? 'Python'
      : existsSync(`${cwd}/Cargo.toml`) ? 'Rust'
      : existsSync(`${cwd}/go.mod`) ? 'Go'
      : 'unknown';
    return chalk.dim(`  Directory    ${cwd}\n  Git branch   ${branch}\n  Project      ${type}`);
  },
});
