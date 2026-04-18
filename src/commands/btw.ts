/**
 * /btw command — Ephemeral query (answered but not saved)
 * Implementation complete
 * Sprint 13: CLI Polish
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { getUnifiedAgentClient } from '../services/UnifiedAgentClient.js';

export function registerBtwCommand(program: Command): void {
  program
    .command('btw <query>')
    .description('Ephemeral query — answered but not saved to history')
    .option('-m, --model <model>', 'Model to use', 'claude-3-haiku-20240307')
    .option('--think', 'Show thinking process')
    .action(async (query: string, options) => {
      const spinner = ora({
        text: chalk.dim('Thinking...'),
        spinner: 'dots',
      }).start();

      try {
        const client = getUnifiedAgentClient();
        
        // Ephemeral: no session persistence
        const response = await client.execute({
          messages: [{ role: 'user', content: query }],
          model: options.model,
          ephemeral: true, // Not saved
          tools: 'all',
        });

        spinner.stop();

        console.log(chalk.green('✓'));
        console.log();
        
        // Print response
        const text = response.message.content;
        console.log(chalk.white(text));
        
        console.log();
        console.log(chalk.dim('─'.repeat(40)));
        console.log(chalk.dim('Ephemeral — not saved'));
        
        if (response.usage) {
          console.log(chalk.dim(
            `Tokens: ${response.usage.totalTokens} | ${response.timing.durationMs}ms`
          ));
        }
      } catch (err) {
        spinner.fail(chalk.red('Failed'));
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

// Simple spinner for ~100 line budget
function ora(opts: { text: string; spinner: string }) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let interval: any;
  const spinner = {
    start: () => {
      interval = setInterval(() => {
        process.stdout.write(`\r${chalk.cyan(frames[i])} ${opts.text}`);
        i = (i + 1) % frames.length;
      }, 80);
      return spinner;
    },
    stop: () => { clearInterval(interval); process.stdout.write('\r'); },
    succeed: (msg: string) => { clearInterval(interval); console.log(`\r${chalk.green('✓')} ${msg}`); },
    fail: (msg: string) => { clearInterval(interval); console.log(`\r${chalk.red('✗')} ${msg}`); },
  };
  return spinner;
}
