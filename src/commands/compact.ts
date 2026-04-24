// @ts-nocheck

/**
 * commands/compact.ts — /compact CLI command
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { pruneToolOutputs } from '../compaction/prune.js';
import { protectMessages } from '../compaction/protect.js';
import { summarizeWithLLM } from '../compaction/summarize.js';
import { updateContext } from '../compaction/update.js';
import type { Message, CompactionResult } from '../compaction/types.js';

export function registerCompactCommand(program: Command): void {
  program
    .command('compact')
    .description('Compact context to free tokens')
    .option('--aggressive', 'More aggressive compaction')
    .option('-m, --model <model>', 'Model for summarization', 'claude-haiku-4-5')
    .action(async (options: { aggressive?: boolean; model?: string }) => {
      // Note: In real implementation, get messages from session
      const messages: Message[] = []; // Placeholder
      
      const beforeTokens = JSON.stringify(messages).length / 4;
      
      // Phase 1: Prune
      let working = pruneToolOutputs(messages);
      
      // Phase 2-3: Protect
      const { protected_, candidates } = protectMessages(working);
      
      if (candidates.length === 0) {
        console.log(chalk.dim('Nothing to compact'));
        return;
      }
      
      // Phase 4: Summarize
      const summary = await summarizeWithLLM(candidates, options.model || 'claude-haiku-4-5');
      
      // Phase 5: Update
      const compacted = updateContext(protected_, summary, candidates);
      
      const afterTokens = JSON.stringify(compacted).length / 4;
      const saved = Math.round(beforeTokens - afterTokens);
      
      console.log(chalk.green('✓ Context compacted'));
      console.log(chalk.dim(`  Before: ${Math.round(beforeTokens)} tokens`));
      console.log(chalk.dim(`  After: ${Math.round(afterTokens)} tokens`));
      console.log(chalk.dim(`  Saved: ${saved} tokens (${Math.round(saved / beforeTokens * 100)}%)`));
      console.log(chalk.dim(`  Summary v${summary.version}: ${summary.decisions.length} decisions, ${summary.files.length} files`));
    });
}
