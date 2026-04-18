// @ts-nocheck

/**
 * remember command - Save memory to unified graph
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getMemory } from '../../utils/unified-memory.js';

export function registerRememberCommand(program: Command): void {
  program
    .command('remember <content>')
    .description('Save a memory (replaces curate)')
    .option('-t, --type <type>', 'Type: fact|rule|lesson', 'fact')
    .option('-l, --layer <layer>', 'Layer: session|project|workspace|global', 'workspace')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--topic <topic>', 'Topic for lessons')
    .option('--confidence <n>', 'Confidence 0-1', '0.7')
    .option('--condition <cond>', 'Condition: always|never|when')
    .option('--action <action>', 'Action for rules')
    .action(async (content: string, opts) => {
      const mem = getMemory();
      const type = opts.type as 'fact' | 'rule' | 'lesson';
      const layer = opts.layer as 'session' | 'project' | 'workspace' | 'global';
      const tags = opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : [];

      try {
        let entry;
        if (type === 'rule') {
          if (!opts.condition) {
            console.error(chalk.red('Error: Rules require --condition'));
            process.exit(1);
          }
          entry = mem.addRule(opts.condition, opts.action || 'apply', { priority: 5, tags });
        } else if (type === 'lesson') {
          if (!opts.topic) {
            console.error(chalk.red('Error: Lessons require --topic'));
            process.exit(1);
          }
          entry = mem.learn(opts.topic, content, { confidence: parseFloat(opts.confidence), tags });
        } else {
          entry = mem.store(content, { layer, type: 'fact', tags, source: 'claimed' });
        }

        console.log(chalk.green('✓ Remembered'));
        console.log(chalk.gray(`  ${content.slice(0, 60)}...`));
        console.log(chalk.gray(`  ID: ${entry.id} | Layer: ${entry.layer}`));
      } catch (e) {
        console.error(chalk.red('Failed:'), e);
        process.exit(1);
      }
    });
}
