/**
 * commands/bug-hunter.ts — Automated test-fix loop (Bug Hunter Mode)
 * Sprint 2.2: Autonomous Healing
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { runAgentLoop } from '../agent/loop.js';
import { getModelManager } from '../models/manager.js';
import { execCmd } from '../utils/safe-exec.js';

export function registerBugHunterCommand(program: Command): void {
  program
    .command('bug-hunter [testCommand]')
    .alias('fix')
    .description('Run tests and automatically fix failures in a loop')
    .option('-m, --model <model>', 'Model to use for fixes', 'auto')
    .option('-i, --iterations <n>', 'Maximum fix iterations', '5')
    .option('--path <path>', 'Working directory', '.')
    .action(async (testCommandArg, options) => {
      const testCommand = testCommandArg || 'npm test';
      const maxIterations = parseInt(options.iterations);
      const model = options.model;
      const cwd = options.path;

      console.log(chalk.bold(`\n🐞 BUG HUNTER MODE`));
      console.log(chalk.dim(`  Test command: ${testCommand}`));
      console.log(chalk.dim(`  Max iterations: ${maxIterations}`));
      console.log(chalk.dim('─'.repeat(40)));

      let lastErrorOutput = '';

      for (let i = 0; i < maxIterations; i++) {
        console.log(chalk.blue(`\n[Iteration ${i + 1}/${maxIterations}] Running tests...`));
        
        let testResult: { success: boolean; output: string };
        try {
          const cmdParts = testCommand.split(/\s+/);
          const output = execCmd(cmdParts[0]!, cmdParts.slice(1), { cwd, stdio: 'pipe' });
          testResult = { success: true, output };
        } catch (err: any) {
          testResult = { success: false, output: err.message + (err.stdout ? '\n' + err.stdout : '') };
        }

        if (testResult.success) {
          console.log(chalk.green('✅ Tests passed! Bug Hunter mission accomplished.'));
          return;
        }

        console.log(chalk.yellow('❌ Tests failed. Analyzing output...'));
        
        // Semantic stagnation check
        if (testResult.output === lastErrorOutput) {
          console.log(chalk.red('⚠️ Error output has not changed. Stagnation detected.'));
          console.log(chalk.dim('Please provide manual guidance or try a different model.'));
          return;
        }
        lastErrorOutput = testResult.output;

        // Run agent loop to fix the bug
        console.log(chalk.cyan('🧠 Thinking of a fix...'));
        
        const prompt = `The following tests are failing:\n\n\`\`\`\n${testResult.output.slice(-2000)}\n\`\`\`\n\nPlease analyze the failure and apply a fix. RUN TESTS again when done to verify.`;
        
        const { tokensUsed } = await runAgentLoop(
          prompt,
          [],
          model,
          (t) => process.stdout.write(chalk.dim(t)),
          (name, input) => console.log(chalk.magenta(`  [tool] ${name}(${JSON.stringify(input)})`)),
          undefined,
          undefined,
          { maxTurns: 3 } // Limit each fix attempt to 3 agent turns
        );

        console.log(chalk.dim(`\nFix attempt ${i + 1} completed (${tokensUsed} tokens used)`));
      }

      console.log(chalk.red(`\n✗ Max iterations (${maxIterations}) reached. Could not fix the bug.`));
    });
}
