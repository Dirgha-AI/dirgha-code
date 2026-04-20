// @ts-nocheck

/**
 * repl/slash/shortcuts.ts — Utility slash commands
 * 
 * Commands:
 * - /btw: Ephemeral query (no history)
 * - /yolo: Auto-approve mode
 * - /remember: Quick curate
 * - /recall: Quick query
 * - /compact: Context compaction
 * - /export: Session export
 * - /import: Session import
 */
import chalk from 'chalk';
import type { SlashCommand, ReplContext } from './types.js';

export const utilCommands: SlashCommand[] = [
  {
    name: 'btw',
    description: 'Ephemeral query — answered but not added to session history',
    args: '<question>',
    category: 'utility',
    handler: async (args, ctx) => {
      if (!args.trim()) return chalk.red('Usage: /btw <question>');
      
      // Mark as ephemeral so it won't be saved
      ctx.ephemeral = true;
      
      // Send to LLM without adding to session
      const { callGateway } = await import('../../agent/gateway.js');
      const response = await callGateway(
        [{ role: 'user', content: args }],
        'Provide a concise answer. This is an ephemeral query that will not be saved.',
        ctx.model,
      );

      const text = response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text ?? '')
        .join('');
      return text || chalk.dim('(no response)');
    },
  },
  {
    name: 'yolo',
    description: 'Auto-approve all tool calls (use with caution)',
    args: '[on|off|status]',
    category: 'safety',
    handler: (args, ctx) => {
      const mode = args.trim() || 'status';
      
      if (mode === 'on') {
        ctx.permissionLevel = 'auto';
        ctx.yoloMode = true;
        return chalk.yellow('⚠ YOLO mode enabled: All tools will auto-approve for this session');
      }
      if (mode === 'off') {
        ctx.permissionLevel = 'suggest';
        ctx.yoloMode = false;
        return chalk.green('YOLO mode disabled: Normal approval flow restored');
      }
      
      const status = ctx.yoloMode ? 'enabled' : 'disabled';
      return chalk.dim(`YOLO mode: ${status}`);
    },
  },
  {
    name: 'remember',
    description: 'Quick curate — add a fact to knowledge graph without files',
    args: '<fact> [--tags tag1,tag2]',
    category: 'knowledge',
    handler: async (args, ctx) => {
      if (!args.trim()) return chalk.red('Usage: /remember <fact> [--tags tag1,tag2]');
      
      // Parse tags
      let fact = args;
      let tags: string[] = [];
      const tagsMatch = args.match(/--tags?\s+([\w,]+)/);
      if (tagsMatch) {
        tags = tagsMatch[1].split(',').filter(Boolean);
        fact = args.replace(tagsMatch[0], '').trim();
      }
      
      // Curate without files
      const { curateFact } = await import('../../commands/curate.js');
      await curateFact({ content: fact, tags, projectId: ctx.projectId });
      
      return chalk.green(`✓ Remembered: ${fact.slice(0, 60)}${fact.length > 60 ? '...' : ''}`);
    },
  },
  {
    name: 'recall',
    description: 'Quick query — search knowledge graph',
    args: '<query> [--tags tag1,tag2]',
    category: 'knowledge',
    handler: async (args, ctx) => {
      if (!args.trim()) return chalk.red('Usage: /recall <query> [--tags tag1,tag2]');
      
      // Parse tags
      let query = args;
      let tags: string[] = [];
      const tagsMatch = args.match(/--tags?\s+([\w,]+)/);
      if (tagsMatch) {
        tags = tagsMatch[1].split(',').filter(Boolean);
        query = args.replace(tagsMatch[0], '').trim();
      }
      
      // Search
      const { searchHybrid } = await import('../../search/hybrid.js');
      const { getDb } = await import('../../db/index.js');
      const db = getDb();
      
      const results = searchHybrid(db, {
        query,
        projectId: ctx.projectId,
        tags,
        limit: 5
      });
      
      if (results.length === 0) return chalk.dim('No matching facts found.');
      
      return results.map((r, i) => 
        `${chalk.cyan(`${i + 1}.`)} ${r.content.slice(0, 80)}${r.content.length > 80 ? '...' : ''}`
      ).join('\n');
    },
  },
  {
    name: 'compact',
    description: 'Manually compact context to free tokens',
    args: '[--aggressive]',
    category: 'context',
    handler: async (args, ctx) => {
      const aggressive = args.includes('--aggressive');
      const beforeTokens = JSON.stringify(ctx.messages).length / 4;
      
      // Compact: keep system, last 10 messages, summarize older
      const { compactMessages } = await import('../../agent/compaction.js');
      const compacted = await compactMessages(ctx.messages);
      
      ctx.messages = compacted.messages;
      const afterTokens = JSON.stringify(ctx.messages).length / 4;
      const saved = Math.round(beforeTokens - afterTokens);
      
      return [
        chalk.green(`✓ Context compacted`),
        chalk.dim(`  Before: ${Math.round(beforeTokens)} tokens`),
        chalk.dim(`  After: ${Math.round(afterTokens)} tokens`),
        chalk.dim(`  Saved: ${saved} tokens (${Math.round(saved / beforeTokens * 100)}%)`),
      ].join('\n');
    },
  },
  {
    name: 'export',
    description: 'Export session to file (json|md|html)',
    args: '[format] [filename]',
    category: 'session',
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const format = parts[0] || 'json';
      const filename = parts[1] || `session-${Date.now()}.${format}`;

      const { writeFileSync } = await import('node:fs');
      const data = {
        messages: ctx.messages,
        model: ctx.model,
        exportedAt: new Date().toISOString(),
      };
      
      if (format === 'json') {
        writeFileSync(filename, JSON.stringify(data, null, 2));
      } else if (format === 'md') {
        const md = ctx.messages.map((m: any) =>
          `## ${m.role}\n\n${m.content}\n`
        ).join('---\n\n');
        writeFileSync(filename, md);
      } else {
        return chalk.red(`Unknown format: ${format}. Use: json, md`);
      }
      
      return chalk.green(`✓ Exported to ${filename}`);
    },
  },
  {
    name: 'import',
    description: 'Import session from file',
    args: '<filename>',
    category: 'session',
    handler: async (args, ctx) => {
      const filename = args.trim();
      if (!filename) return chalk.red('Usage: /import <filename>');

      const { existsSync, readFileSync } = await import('node:fs');
      if (!existsSync(filename)) return chalk.red(`File not found: ${filename}`);

      const data = JSON.parse(readFileSync(filename, 'utf8'));
      ctx.messages = data.messages || [];
      if (data.model) ctx.model = data.model;
      
      return chalk.green(`✓ Imported ${ctx.messages.length} messages from ${filename}`);
    },
  },
];
