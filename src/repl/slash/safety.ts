/**
 * repl/slash/safety.ts — Safety and permission commands
 */
import chalk from 'chalk';
import { getTheme } from '../themes.js';
import type { SlashCommand, ReplContext } from './types.js';

export const safetyCommands: SlashCommand[] = [
  {
    name: 'plan',
    description: 'Enter read-only plan mode (no write/bash tools)',
    category: 'safety',
    handler: (_args, ctx) => {
      ctx.isPlanMode = true;
      return getTheme().warning('[PLAN MODE] Write tools disabled. Use /unplan to exit.');
    },
  },
  {
    name: 'unplan',
    description: 'Exit plan mode, re-enable all tools',
    category: 'safety',
    handler: (_args, ctx) => {
      ctx.isPlanMode = false;
      return chalk.green('Plan mode disabled.');
    },
  },
  {
    name: 'yolo',
    description: 'Toggle approval bypass for dangerous commands',
    category: 'safety',
    handler: (_args, ctx) => {
      ctx.isYolo = !ctx.isYolo;
      if (ctx.isYolo) return getTheme().error('⚠ YOLO mode ON — all permission prompts bypassed');
      return chalk.green('YOLO mode off — permission prompts restored.');
    },
  },
  {
    name: 'checkpoint',
    description: 'Create a shadow-git checkpoint (restore point)',
    args: '[description]',
    category: 'safety',
    handler: async (args) => {
      const { createCheckpoint } = await import('../../session/checkpoint.js');
      const id = await createCheckpoint(args || 'manual checkpoint');
      return chalk.green(`✓ Checkpoint created: ${id}`);
    },
  },
  {
    name: 'rollback',
    description: 'Restore from a checkpoint',
    args: '[checkpoint-id]',
    category: 'safety',
    handler: async (args) => {
      const { listCheckpoints, restoreCheckpoint } = await import('../../session/checkpoint.js');
      if (!args.trim()) {
        const checkpoints = listCheckpoints();
        if (!checkpoints.length) return chalk.dim('No checkpoints found.');
        const t = getTheme();
        let out = '\n  Checkpoints:\n';
        for (const cp of checkpoints.slice(-10)) {
          out += `  ${t.primary(cp.id.slice(0, 8))}  ${t.dim(cp.timestamp)}  ${cp.description}\n`;
        }
        return out;
      }
      await restoreCheckpoint(args.trim());
      return chalk.green(`✓ Restored checkpoint: ${args.trim()}`);
    },
  },
  {
    name: 'permissions',
    description: 'Show or set permission level',
    args: '[ReadOnly|WorkspaceWrite|DangerFullAccess|Prompt|Allow]',
    category: 'safety',
    handler: (args, ctx) => {
      const levels = ['ReadOnly', 'WorkspaceWrite', 'DangerFullAccess', 'Prompt', 'Allow'];
      if (!args.trim()) return chalk.dim(`Permission level: ${ctx.permissionLevel}`);
      if (!levels.includes(args.trim())) return chalk.red(`Valid levels: ${levels.join(', ')}`);
      ctx.permissionLevel = args.trim() as any;
      return chalk.green(`Permission level set to: ${args.trim()}`);
    },
  },
  {
    name: 'approvals',
    description: 'Manage HITL approval requests: list | approve <id> | reject <id>',
    args: '[list|approve|reject] [id]',
    category: 'safety',
    handler: async (args) => {
      const { listApprovals, resolveApproval, getApproval } = await import('../../permission/approval.js');
      const parts = args.trim().split(/\s+/);
      const sub = parts[0] ?? 'list';
      const id = parts[1];

      if (sub === 'approve' || sub === 'reject') {
        if (!id) return chalk.red(`Usage: /approvals ${sub} <id>`);
        const approval = getApproval(id);
        if (!approval) return chalk.red(`Approval not found: ${id}`);
        if (approval.status !== 'pending') return chalk.yellow(`Already ${approval.status}: ${id.slice(0, 8)}`);
        const ok = resolveApproval(approval.id, sub === 'approve' ? 'approved' : 'rejected');
        if (!ok) return chalk.red(`Failed to update approval: ${id}`);
        const icon = sub === 'approve' ? chalk.green('✓ Approved') : chalk.red('✗ Rejected');
        return `${icon}: ${approval.toolName} (${approval.id.slice(0, 8)})`;
      }

      // list
      const filter = (sub === 'pending' || sub === 'list') ? 'pending' : undefined;
      const records = listApprovals(filter as any);
      if (!records.length) return chalk.dim('  No pending approvals.');

      const t = getTheme();
      let out = '\n' + t.header('  Pending Approvals') + '\n\n';
      for (const r of records) {
        const statusColor = r.status === 'pending' ? chalk.yellow : r.status === 'approved' ? chalk.green : chalk.red;
        const args = (() => { try { const a = JSON.parse(r.toolArgs); return JSON.stringify(a).slice(0, 60); } catch { return r.toolArgs.slice(0, 60); } })();
        out += `  ${t.primary(r.id.slice(0, 8))}  ${statusColor(r.status.padEnd(8))}  ${chalk.cyan(r.toolName.padEnd(16))}  ${chalk.dim(args)}\n`;
      }
      out += chalk.dim(`\n  Use: /approvals approve <id> | /approvals reject <id>\n`);
      return out;
    },
  },
];
