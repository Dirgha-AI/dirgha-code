/**
 * repl/index.ts — REPL orchestrator for Dirgha CLI v2
 * Manages the interactive loop, delegates to slash.ts and agent loop.
 */
import chalk from 'chalk';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { getTheme } from './themes.js';
import { executionController } from '../utils/execution-controller.js';

declare const __CLI_VERSION__: string;
const CLI_VERSION: string = (typeof __CLI_VERSION__ !== 'undefined') ? __CLI_VERSION__ : '1.0.0';

// Track last tool start time for elapsed display
let lastToolStart = 0;

export function checkForUpdates(current: string): void {
  setTimeout(() => {
    try {
      const result = execSync('npm view @dirgha/code version --json 2>/dev/null', { timeout: 3000, encoding: 'utf-8' });
      const latest = result.trim().replace(/^"|"$/g, '');
      if (latest && latest !== current) {
        process.stdout.write(chalk.dim(`\n  Update available: ${latest} → run dirgha update\n`));
      }
    } catch { /* offline or not published yet */ }
  }, 500);
}
import { handleSlash, extendRegistry } from './slash/index.js';
import { gitCommands } from './slash-git.js';
import { workflowCommands } from './slash-workflow.js';

// Register extension command sets
extendRegistry(gitCommands);
extendRegistry(workflowCommands);
import { StreamingRenderer, Spinner, renderToolBox } from './renderer.js';
import { runAgentLoop, buildSystemPrompt } from '../agent/loop.js';
import { getDefaultModel } from '../agent/gateway.js';
import { resolveModel, classifyQuery } from '../agent/routing.js';
import { syncSession } from '../sync/session.js';
import { isProjectInitialized } from '../utils/config.js';
import { isLoggedIn } from '../utils/credentials.js';
import { showRecoveryMenu, saveCheckpoint, loadCheckpoint, deleteCheckpoint } from './escape-recovery.js';
import type { Message, ReplContext } from '../types.js';
import { consoleStream } from '../types.js';

export async function startRepl(singleShotPrompt?: string): Promise<void> {
  const theme = getTheme();

  if (!isLoggedIn()) {
    console.log(chalk.red('\n✗ Not authenticated.\n'));
    console.log(chalk.dim('  Run: ') + chalk.cyan('dirgha login') + chalk.dim(' to connect your Dirgha account.\n'));
    process.exit(1);
  }

  const isRoot = process.getuid?.() === 0;
  const model = getDefaultModel();
  console.log(theme.primary('\n◆ Dirgha CLI') + chalk.dim(` v${CLI_VERSION}`));
  if (isRoot) {
    console.log(chalk.yellow('  ⚡ root — all operations run with full system access'));
  }
  console.log(chalk.dim(`  Model: ${model}  |  type /help for commands\n`));

  if (!isProjectInitialized()) {
    console.log(chalk.dim('  Tip: run "dirgha init" to add project context\n'));
  }

  checkForUpdates(CLI_VERSION); // non-blocking background check
  buildSystemPrompt(); // pre-warm

  const sessionId = crypto.randomUUID();
  let totalTokens = 0;

  const ctx: ReplContext = {
    messages: [] as Message[],
    model,
    totalTokens,
    toolCallCount: 0,
    sessionId,
    isPlanMode: false,
    isYolo: false,
    modelTier: 'auto',
    todos: [],
    permissionLevel: 'WorkspaceWrite',
    activeTheme: 'default',
    stream: consoleStream,
    print: (text: string) => consoleStream.markdown(text),
    cwd: process.cwd(),
  };

  const renderer = new StreamingRenderer();
  const spinner = new Spinner();

  // Jitter fix: only clear spinner on the FIRST chunk per response, not every chunk
  let spinnerCleared = false;
  const onText = (t: string): void => {
    if (!spinnerCleared) {
      spinnerCleared = true;
      spinner.clear();
    }
    renderer.feed(t);
  };

  const onTool = (name: string, input: Record<string, unknown>): void => {
    const now = Date.now();
    const elapsedMs = lastToolStart > 0 ? now - lastToolStart : 0;
    lastToolStart = now;

    renderer.flush();
    spinnerCleared = false; // reset for next text block
    spinner.stop();

    renderToolBox(name, input, elapsedMs);
    ctx.toolCallCount++;
    spinner.start(chalk.dim('working...'));
  };

  if (singleShotPrompt) {
    spinnerCleared = false;
    spinner.start(theme.dim('  thinking'));
    const result = await runAgentLoop(singleShotPrompt, [], ctx.model, onText, onTool);
    renderer.flush();
    spinner.stop();
    console.log(chalk.dim(`\n  Tokens: ${result.tokensUsed}\n`));
    return;
  }

  console.log(chalk.dim('  Type your task. Use /help for slash commands. Ctrl+C to exit.\n'));

  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  // Enable keypress events — keep rl reference so readline cooked mode stays intact
  readline.emitKeypressEvents(process.stdin, rl);

  // ESC key handling — uses showRecoveryMenu which is safe (no raw mode)
  let agentInterrupted = false;

  const escHandler = async (_str: string, key: { name?: string }): Promise<void> => {
    if (key?.name !== 'escape') return;
    
    if (spinner.isSpinning()) {
      agentInterrupted = true;
      // Kill any stuck child processes (git, npm, etc.)
      const killed = executionController.killAll();
      process.stdout.write('\r\x1B[K'); // erase spinner line
      process.stdout.write(chalk.yellow('  ⚡ stopping after current step...\n'));
      if (killed > 0) {
        process.stdout.write(chalk.dim(`     killed ${killed} stuck process${killed > 1 ? 'es' : ''}\n`));
      }
    } else {
      // Idle: use the safe recovery menu (cooked mode, NOT raw mode)
      rl.pause(); // Pause main readline
      
      const checkpointId = saveCheckpoint(ctx.messages, ctx.model, totalTokens, ctx.cwd);
      const choice = await showRecoveryMenu(checkpointId, ctx.messages, ctx.model, totalTokens);
      
      rl.resume(); // Resume main readline (safe - Enter works!)

      switch (choice) {
        case 'resume': {
          const checkpoint = loadCheckpoint(checkpointId);
          if (checkpoint) {
            ctx.messages.splice(0, ctx.messages.length, ...checkpoint.messages);
            ctx.model = checkpoint.model;
            totalTokens = checkpoint.tokensUsed;
            ctx.totalTokens = totalTokens;
            console.log(chalk.green('\n▶ Resumed from checkpoint\n'));
          }
          break;
        }
        case 'continue':
          console.log(chalk.dim('\n▶ Continuing without checkpoint\n'));
          break;
        case 'save-exit':
          console.log(chalk.green('\n✓ Session saved. Exiting...'));
          rl.close();
          cleanupStdin();
          process.exit(0);
          break;
        case 'exit':
          deleteCheckpoint(checkpointId);
          console.log(chalk.red('\n→ Exiting without saving'));
          rl.close();
          cleanupStdin();
          process.exit(0);
          break;
      }
    }
  };
  process.stdin.on('keypress', escHandler);

  const cleanupStdin = (): void => {
    process.stdin.removeListener('keypress', escHandler);
    process.stdin.pause();
  };

  const askLine = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const onClose = () => reject(new Error('closed'));
      rl.once('close', onClose);
      rl.question(chalk.cyan('> '), (line) => {
        rl.removeListener('close', onClose);
        resolve(line);
      });
    });

  while (true) {
    let input: string;
    try {
      input = await askLine();
    } catch {
      console.log(chalk.dim('\n  Session ended.\n'));
      break;
    }

    const trimmed = input.trim();
    if (!trimmed) continue;
    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log(chalk.dim('\n  Session ended.\n'));
      break;
    }

    if (trimmed.startsWith('/')) {
      await handleSlash(trimmed, ctx);
      totalTokens = ctx.totalTokens;
      continue;
    }

    console.log();
    const effectiveModel = ctx.modelTier === 'auto'
      ? resolveModel(classifyQuery(trimmed, ctx.messages))
      : resolveModel(ctx.modelTier, ctx.model);

    agentInterrupted = false;
    spinnerCleared = false;
    spinner.start(theme.dim('  thinking'));
    const result = await runAgentLoop(trimmed, ctx.messages, effectiveModel, onText, onTool);
    renderer.flush();
    spinner.stop();

    if (agentInterrupted) {
      agentInterrupted = false;
      console.log(chalk.dim('\n  ⏹ Stopped. Continue below.\n'));
    } else {
      process.stdout.write('\n');
    }

    ctx.messages.splice(0, ctx.messages.length, ...result.messages);
    totalTokens += result.tokensUsed;
    ctx.totalTokens = totalTokens;
  }

  rl.close();
  cleanupStdin();

  if (ctx.messages.length > 0 && !process.argv.includes('--no-sync')) {
    await syncSession(ctx.messages, ctx.model, totalTokens);
  }
}
