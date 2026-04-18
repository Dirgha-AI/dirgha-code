/**
 * slash-workflow.ts — AI workflow slash commands for Dirgha CLI v2.
 * Commands: /bughunter, /ultraplan, /agents, /skills, /teleport
 * Dirgha session workflow — slash command processing.
 */
import chalk from 'chalk';
import type { SlashCommand } from './slash/types.js';

export const workflowCommands: SlashCommand[] = [
  {
    name: 'bughunter',
    aliases: ['bug'],
    description: 'Enter structured bug investigation mode with guided workflow',
    category: 'dev',
    handler: (_args, ctx) => {
      ctx.bugHunterMode = true;
      ctx.systemOverrides = [
        ...(ctx.systemOverrides ?? []),
        'You are now in BugHunter mode. Follow this structured investigation:\n' +
        '1. REPRODUCE: Confirm the bug and identify the exact failing input\n' +
        '2. ISOLATE: Narrow down to the smallest failing unit (function/line)\n' +
        '3. HYPOTHESIZE: State 2-3 hypotheses for the root cause\n' +
        '4. VERIFY: Test each hypothesis, ruling out false trails\n' +
        '5. FIX: Apply the minimal fix with no scope creep\n' +
        '6. VALIDATE: Confirm fix, check for regressions\n' +
        'Always state your current step. Never skip ahead.',
      ];
      return chalk.yellow('🐛 BugHunter mode activated — structured investigation protocol engaged\n') +
        chalk.dim('Workflow: Reproduce → Isolate → Hypothesize → Verify → Fix → Validate\n') +
        chalk.dim('Type /status to confirm mode. Run /unplan to exit.');
    },
  },
  {
    name: 'ultraplan',
    aliases: ['deep'],
    description: 'Engage deep planning mode — exhaustive analysis before any action',
    category: 'dev',
    handler: (_args, ctx) => {
      ctx.isPlanMode = true;
      ctx.systemOverrides = [
        ...(ctx.systemOverrides ?? []),
        'ULTRAPLAN MODE ACTIVE: Before taking ANY action:\n' +
        '1. State the full problem scope and constraints\n' +
        '2. List ALL viable approaches (minimum 3)\n' +
        '3. Score each by: complexity, reversibility, blast radius, time cost\n' +
        '4. Select optimal approach and explain the trade-offs\n' +
        '5. Break into atomic steps (each independently reviewable)\n' +
        '6. Flag risks and propose mitigations\n' +
        'Only then may you execute. Over-plan is better than under-plan.',
      ];
      return chalk.magenta('🧠 UltraPlan mode activated — deep thinking protocol engaged\n') +
        chalk.dim('You will now plan exhaustively before executing.\n') +
        chalk.dim('Type /unplan to return to standard mode.');
    },
  },
  {
    name: 'teleport',
    description: 'Resume or jump to a saved session context by ID or name',
    args: '[session-id]',
    category: 'session',
    handler: (args, ctx) => {
      if (!args.trim()) {
        return chalk.cyan('Saved sessions:\n') +
          chalk.dim('  Use /save <name> to create sessions, then /teleport <name> to jump back.\n') +
          chalk.dim(`  Current session: ${ctx.sessionId ?? 'unsaved'}`);
      }
      ctx.pendingTeleport = args.trim();
      return chalk.yellow(`⚡ Teleport queued to session: ${args.trim()}\n`) +
        chalk.dim('Session context will be loaded on next agent turn.');
    },
  },
  {
    name: 'agents',
    description: 'List active sub-agents and their status',
    category: 'dev',
    handler: (_args, ctx) => {
      const agents = ctx.subAgents ?? [];
      if (agents.length === 0) {
        return chalk.dim('No active sub-agents. Sub-agents are spawned via the spawn_agent tool.');
      }
      return agents.map((a: any, i: number) =>
        chalk.cyan(`  [${i + 1}] ${a.id} — ${a.type} — ${a.status}`)).join('\n');
    },
  },
  {
    name: 'skills',
    description: 'List or apply agent skill templates (bughunter | researcher | writer)',
    args: '[skill-name]',
    category: 'dev',
    handler: (args, _ctx) => {
      const SKILLS: Record<string, string> = {
        bughunter: 'Structured debugging (use /bughunter to activate)',
        ultraplan: 'Deep exhaustive planning (use /ultraplan to activate)',
        researcher: 'Academic research: cite sources, verify claims, avoid hallucination',
        writer: 'Technical writing: clear, concise, IBM Carbon style, no jargon',
        tester: 'Test-first: write failing tests first, then implement to pass',
        refactor: 'Refactor: preserve behavior, reduce complexity, no new features',
        reviewer: 'Code review: security, performance, correctness, style',
      };
      if (!args.trim()) {
        const lines = Object.entries(SKILLS).map(([name, desc]) =>
          `  ${chalk.cyan('/' + name.padEnd(14))} ${chalk.white(desc)}`);
        return chalk.yellow('Available skills:\n') + lines.join('\n');
      }
      const skill = SKILLS[args.trim().toLowerCase()];
      if (!skill) return chalk.red(`Unknown skill: ${args.trim()}. Use /skills to list.`);
      return chalk.green(`Skill '${args.trim()}': ${skill}`);
    },
  },
];
