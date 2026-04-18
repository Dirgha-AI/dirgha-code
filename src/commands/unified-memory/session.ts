
/**
 * session commands - Manage isolated working sessions
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getMemory } from '../../utils/unified-memory.js';
import { writeState } from '../../utils/state.js';

export function registerSessionCommands(program: Command): void {
  program
    .command('session-start [project-id]')
    .description('Start isolated working session (fresh context)')
    .option('-d, --description <desc>', 'Session description')
    .action(async (projectId: string | undefined, opts) => {
      const mem = getMemory();
      try {
        const session = mem.startSession(projectId, opts.description);
        writeState({ lastSessionId: session.id });
        console.log(chalk.green('✓ Session started'));
        console.log(chalk.gray(`  ID: ${session.id}${projectId ? ' | Project: ' + projectId : ''}`));
        console.log(chalk.gray('  Working context is now isolated.'));
      } catch (e) {
        console.error(chalk.red('Failed:'), e);
        process.exit(1);
      }
    });

  program
    .command('session-end')
    .description('End session (archive to project)')
    .action(async () => {
      const mem = getMemory();
      if (!mem.getCurrentSessionId()) {
        console.log(chalk.yellow('No active session'));
        return;
      }
      try {
        mem.endSession();
        writeState({ lastSessionId: undefined });
        console.log(chalk.green('✓ Session ended'));
        console.log(chalk.gray('Memories archived to project scope.'));
      } catch (e) {
        console.error(chalk.red('Failed:'), e);
        process.exit(1);
      }
    });

  program
    .command('session-status')
    .description('Show current session info')
    .action(async () => {
      const mem = getMemory();
      const sid = mem.getCurrentSessionId();
      const pid = mem.getCurrentProjectId();
      if (!sid) {
        console.log(chalk.yellow('No active session. Run: dirgha session-start'));
        return;
      }
      console.log(chalk.blue('Current Session:'));
      console.log(chalk.gray(`  ID: ${sid}`));
      if (pid) console.log(chalk.gray(`  Project: ${pid}`));
      console.log(chalk.gray(`  Memories: ${mem.getSessionContext().length}`));
    });
}
