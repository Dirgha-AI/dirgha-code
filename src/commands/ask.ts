/**
 * commands/ask.ts — Headless one-shot agent mode
 *
 * dirgha ask "build me a fibonacci function"
 * dirgha ask --model claude-opus-4-7 --max-turns 30 "refactor auth.ts"
 *
 * Streams output to stdout, exits 0 on success, 1 on failure.
 * Saves checkpoint to ~/.dirgha/checkpoints/<session>.json on completion.
 * Supports --resume <session-id> to continue from a saved checkpoint.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { runAgentLoop } from '../agent/loop.js';
import { getDefaultModel } from '../agent/gateway.js';
import type { Message } from '../types.js';

export function registerAskCommand(program: Command): void {
  program
    .command('ask [prompt...]')
    .description('Run agent headlessly — streams output, exits when done')
    .option('-m, --model <model>', 'Model to use', getDefaultModel())
    .option('-n, --max-turns <n>', 'Max agent iterations', '30')
    .option('--resume <sessionId>', 'Resume from a saved checkpoint')
    .option('--session <sessionId>', 'Set a specific session ID')
    .option('--no-tools', 'Disable all tools (pure chat mode)')
    .option('--quiet', 'Suppress tool call output, print only final answer')
    .action(async (promptParts: string[], opts) => {
      const model = opts.model ?? getDefaultModel();
      const maxTurns = parseInt(opts.maxTurns ?? '30', 10);
      const sessionId = opts.session ?? `ask_${Date.now()}`;
      const quiet = !!opts.quiet;

      let messages: Message[] = [];
      let userInput = promptParts.join(' ').trim();

      // Resume from checkpoint if requested
      if (opts.resume) {
        const ckptPath = join(homedir(), '.dirgha', 'checkpoints', `${opts.resume}.json`);
        try {
          const saved = JSON.parse(readFileSync(ckptPath, 'utf8'));
          messages = saved.messages ?? [];
          if (!userInput && saved.userInput) userInput = saved.userInput;
          process.stderr.write(chalk.dim(`[resume] Loaded ${messages.length} messages from ${opts.resume}\n`));
        } catch {
          process.stderr.write(chalk.red(`[resume] Checkpoint not found: ${ckptPath}\n`));
          process.exit(1);
        }
      }

      if (!userInput) {
        // Try reading from stdin if piped
        if (!process.stdin.isTTY) {
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) chunks.push(chunk);
          userInput = Buffer.concat(chunks).toString('utf8').trim();
        }
      }

      if (!userInput) {
        process.stderr.write(chalk.red('Usage: dirgha ask "your prompt"\n'));
        process.exit(1);
      }

      const abortController = new AbortController();
      const onSig = () => { abortController.abort(); };
      process.on('SIGINT', onSig);
      process.on('SIGTERM', onSig);

      let finalText = '';

      try {
        const result = await runAgentLoop(
          userInput,
          messages,
          model,
          (text) => {
            finalText += text;
            if (!quiet) process.stdout.write(text);
          },
          (name, _input) => {
            if (!quiet) process.stderr.write(chalk.dim(`\n[tool] ${name}\n`));
            return `tool_${Date.now()}`;
          },
          undefined,
          undefined,
          { maxTurns, sessionId, signal: abortController.signal },
          (thought) => {
            if (!quiet && process.env['DIRGHA_DEBUG'] === '1') {
              process.stderr.write(chalk.dim(`<think>${thought}</think>\n`));
            }
          },
          (toolId, name, resultText, isError) => {
            if (!quiet) {
              const icon = isError ? chalk.red('✗') : chalk.green('✓');
              process.stderr.write(chalk.dim(`  ${icon} ${name}: ${resultText.slice(0, 80)}\n`));
            }
          },
        );

        // Save final checkpoint
        try {
          const ckptDir = join(homedir(), '.dirgha', 'checkpoints');
          mkdirSync(ckptDir, { recursive: true });
          writeFileSync(
            join(ckptDir, `${sessionId}.json`),
            JSON.stringify({ userInput, messages: result.messages, model, ts: Date.now() }, null, 2)
          );
        } catch { /* non-fatal */ }

        // Print final answer if quiet (only the assistant's last response)
        if (quiet) process.stdout.write(finalText);

        process.stderr.write(chalk.dim(
          `\n[done] ${result.tokensUsed} tokens · $${result.costUsd.toFixed(4)} · session: ${sessionId}\n`
        ));
        process.exit(0);
      } catch (err: any) {
        if (err?.name === 'AbortError' || err?.message === 'Aborted') {
          process.stderr.write(chalk.yellow('\n[aborted]\n'));
          process.exit(130);
        }
        process.stderr.write(chalk.red(`\n[error] ${err?.message ?? String(err)}\n`));
        process.exit(1);
      }
    });
}
