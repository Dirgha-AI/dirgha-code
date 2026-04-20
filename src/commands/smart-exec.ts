import { Command } from 'commander';
import chalk from 'chalk';
import { executionController, ExecutionController, ExecutionProgress } from '../utils/execution-controller.js';
import { pasteHandler, PasteResult } from '../utils/paste-handler.js';
import { createHealthMonitor, ProcessHealthMonitor } from '../utils/health-monitor.js';
import { EXECUTION_CONFIG, getTimeoutForCommand, getRetriesForCommand } from '../config/execution.js';
import { redactSecrets } from '../agent/secrets.js';

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function registerSmartExec(program: Command): void {
  program
    .command('exec <command>')
    .description('Execute command with timeout, auto-retry, and recovery')
    .option('-t, --timeout <ms>', 'Timeout in milliseconds', (val) => parseInt(val))
    .option('-r, --retries <n>', 'Number of retry attempts', (val) => parseInt(val))
    .option('-f, --fallback <cmds...>', 'Fallback commands to try on failure')
    .option('-c, --chunked', 'Use chunked execution for large inputs')
    .option('--no-progress', 'Disable progress output')
    .option('--max-output <bytes>', 'Maximum output bytes', (val) => parseInt(val))
    .action(async (command, options) => {
      const controller = new ExecutionController();
      const health = createHealthMonitor();

      const args = command.split(' ').filter(Boolean);
      const cmd = args.shift()!;

      const timeout = options.timeout ?? getTimeoutForCommand(cmd);
      const retries = options.retries ?? getRetriesForCommand(cmd);

      let progressEnabled = options.progress !== false;
      let lastProgress = '';

      controller.on('attempt', ({ attempt, totalAttempts }) => {
        if (progressEnabled) {
          console.log(chalk.blue(`\n▶ Attempt ${attempt}/${totalAttempts}: ${cmd} ${args.join(' ')}`));
        }
      });

      controller.on('retry', ({ attempt, delayMs, error }) => {
        if (progressEnabled) {
          console.log(chalk.yellow(`↻ Retrying in ${delayMs}ms... (${error.slice(0, 100)})`));
        }
      });

      controller.on('timeout', ({ duration, limit }) => {
        if (progressEnabled) {
          console.log(chalk.red(`\n⏱ Timeout after ${formatDuration(duration)} (limit: ${formatDuration(limit)})`));
          console.log(chalk.dim('Killing process and trying fallback...'));
        }
      });

      controller.on('progress', ({ bytes, lines, duration }: ExecutionProgress) => {
        if (progressEnabled) {
          const line = `📊 ${lines.toLocaleString()} lines, ${formatBytes(bytes)}, ${formatDuration(duration)}`;
          process.stdout.write(`\r${line.padEnd(60)}`);
          lastProgress = line;
        }
      });

      controller.on('chunking', ({ reason, size }) => {
        if (progressEnabled) {
          console.log(chalk.yellow(`\n⚡ Output large (${formatBytes(size)}). Switching to chunked mode...`));
        }
      });

      controller.on('chunk', ({ current, total, size }) => {
        if (progressEnabled) {
          console.log(chalk.dim(`  Chunk ${current}/${total} (${size} items)...`));
        }
      });

      controller.on('fallback', ({ from, to, index, total }) => {
        if (progressEnabled) {
          console.log(chalk.cyan(`↺ Fallback ${index}/${total}: ${from} → ${to}`));
        }
      });

      controller.on('truncated', ({ maxBytes }) => {
        if (progressEnabled) {
          console.log(chalk.yellow(`\n⚠️ Output truncated at ${formatBytes(maxBytes)}`));
        }
      });

      health.on('stuck', ({ timeSinceOutput, recommendation }) => {
        console.log(chalk.red(`\n🛑 Process stuck for ${(timeSinceOutput / 1000).toFixed(1)}s`));
        console.log(chalk.dim(recommendation));
      });

      health.on('critical', ({ memoryUsage, recommendation }) => {
        console.log(chalk.red(`\n💥 Memory critical: ${formatBytes(memoryUsage)}`));
        console.log(chalk.dim(recommendation));
      });

      health.start();

      try {
        const result = await controller.execute(cmd, args, {
          timeout,
          retries,
          fallback: options.fallback,
          chunked: options.chunked,
          maxOutputBytes: options.maxOutput ?? EXECUTION_CONFIG.output.maxBytes,
        });

        if (lastProgress) {
          process.stdout.write('\r' + ' '.repeat(60) + '\r');
        }

        if (result.stdout) {
          const safeOutput = redactSecrets(result.stdout);
          console.log(safeOutput);
        }

        if (result.stderr && !result.success) {
          const safeError = redactSecrets(result.stderr);
          console.error(chalk.red(safeError));
        }

        console.log('\n' + '─'.repeat(56));
        console.log(result.success ? chalk.green('✅ Success') : chalk.red('❌ Failed'));
        console.log(`   Duration: ${formatDuration(result.duration)}`);
        console.log(`   Attempts: ${result.attempts}`);
        console.log(`   Strategy: ${result.strategy}`);
        if (result.killed) console.log(chalk.yellow('   ⚠️ Process was killed (timeout)'));
        if (result.truncated) console.log(chalk.yellow('   ⚠️ Output was truncated'));
        console.log('─'.repeat(56));

        process.exit(result.success ? 0 : 1);
      } catch (error) {
        if (lastProgress) {
          process.stdout.write('\r' + ' '.repeat(60) + '\r');
        }
        console.error(chalk.red(`\n💥 Fatal error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      } finally {
        health.stop();
      }
    });

  program
    .command('paste')
    .alias('p')
    .description('Paste content with line count, byte tracking, and preview')
    .option('-l, --max-lines <n>', 'Maximum lines to accept', (val) => parseInt(val))
    .option('-c, --max-chars <n>', 'Maximum characters', (val) => parseInt(val))
    .option('--no-preview', 'Disable preview display')
    .option('--save <path>', 'Save to file instead of stdout')
    .option('--clipboard', 'Try to paste from system clipboard first')
    .action(async (options) => {
      let result: PasteResult | null = null;

      if (options.clipboard) {
        result = await pasteHandler.pasteFromClipboard();
        if (result) {
          console.log(chalk.green('✓ Pasted from clipboard'));
        } else {
          console.log(chalk.yellow('⚠ Could not read clipboard. Enter paste mode...'));
        }
      }

      if (!result) {
        result = await pasteHandler.capturePaste({
          maxLines: options.maxLines ?? EXECUTION_CONFIG.paste.maxLines,
          maxChars: options.maxChars ?? EXECUTION_CONFIG.paste.maxChars,
          showProgress: true,
        });
      }

      pasteHandler.displayPasteSummary(result);

      if (options.save) {
        const fs = await import('fs');
        fs.writeFileSync(options.save, result.content, 'utf8');
        console.log(chalk.green(`✓ Saved to ${options.save}`));
      } else if (!options.preview === false) {
        console.log('\n📋 Full content (first 500 chars):');
        console.log('─'.repeat(56));
        console.log(result.content.slice(0, 500) + (result.content.length > 500 ? '...' : ''));
        console.log('─'.repeat(56));
      }
    });

  program
    .command('monitor <command>')
    .description('Execute with real-time health monitoring and stuck detection')
    .option('-t, --timeout <ms>', 'Stuck detection threshold', '30000')
    .option('--memory-warning <bytes>', 'Memory warning threshold', '209715200')
    .option('--memory-critical <bytes>', 'Memory critical threshold', '524288000')
    .action(async (command, options) => {
      const health = createHealthMonitor({
        stuckThreshold: parseInt(options.timeout),
        memoryWarning: parseInt(options.memoryWarning),
        memoryCritical: parseInt(options.memoryCritical),
      });

      const args = command.split(' ').filter(Boolean);
      const cmd = args.shift()!;

      console.log(chalk.blue(`Monitoring: ${cmd} ${args.join(' ')}`));
      console.log(chalk.dim(`Stuck threshold: ${(parseInt(options.timeout) / 1000).toFixed(0)}s`));
      console.log(chalk.dim('─'.repeat(56)));

      health.on('healthCheck', ({ status, timeSinceOutput, memoryUsage, progress }: { status: string; timeSinceOutput: number; memoryUsage: number; progress: { lines: number } }) => {
        const statusColor: Record<string, typeof chalk.green> = {
          healthy: chalk.green,
          warning: chalk.yellow,
          critical: chalk.red,
          stuck: chalk.red,
          dead: chalk.red,
        };
        const colorFn = statusColor[status] ?? chalk.white;

        const line = `${colorFn('●')} ${status.padEnd(8)} | Output: ${(timeSinceOutput / 1000).toFixed(1)}s | Memory: ${formatBytes(memoryUsage)} | Lines: ${progress.lines}`;
        process.stdout.write(`\r${line.padEnd(70)}`);
      });

      health.on('stuck', ({ timeSinceOutput }) => {
        console.log(chalk.red(`\n\n🛑 STUCK: No output for ${(timeSinceOutput / 1000).toFixed(1)}s`));
      });

      health.on('critical', ({ memoryUsage }) => {
        console.log(chalk.red(`\n\n💥 CRITICAL: Memory at ${formatBytes(memoryUsage)}`));
      });

      health.start();

      const { spawn } = await import('child_process');
      const child = spawn(cmd, args, { stdio: 'inherit' });

      child.on('exit', (code) => {
        health.stop();
        console.log(`\n\nExit code: ${code}`);
        process.exit(code ?? 0);
      });
    });
}
