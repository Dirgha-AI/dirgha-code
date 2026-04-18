/**
 * commands/sync.ts — Knowledge sync commands
 * Sprint 8: push/pull/status for knowledge graph
 * Sprint C: wiki git-sync via --wiki flag
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { pushFacts, pullFacts, getSyncStatus } from '../sync/knowledge.js';
import { syncWikiToGit } from '../knowledge/git-sync.js';

export function registerSyncCommands(program: Command): void {
  const syncCmd = program
    .command('sync')
    .description('Sync knowledge graph with cloud');

  // Wiki git-sync — commits local wiki changes and optionally pushes to a remote
  syncCmd
    .command('wiki')
    .description('Commit wiki changes to local git repo and optionally push')
    .option('-r, --remote <remote>', 'Git remote to push to (e.g. origin)')
    .action(async (options) => {
      console.log(chalk.dim('\n  Syncing wiki to git...'));
      try {
        const result = await syncWikiToGit(options.remote);
        if (result.committed) {
          console.log(chalk.green(`\n  ✓ ${result.message}`));
          if (result.pushed) {
            console.log(chalk.dim(`  Pushed to remote: ${options.remote}`));
          }
        } else {
          console.log(chalk.dim(`\n  ${result.message}`));
        }
      } catch (e: any) {
        console.log(chalk.red(`\n  ✗ Wiki sync failed: ${e.message}\n`));
      }
      console.log();
    });

  syncCmd
    .command('push')
    .description('Push local knowledge to cloud')
    .option('-p, --project', 'Sync only current project')
    .action(async (options) => {
      const { isLoggedIn } = await import('../utils/credentials.js');
      if (!isLoggedIn()) {
        console.log(chalk.red('\n  ✗ Not authenticated. Run `dirgha login` first.\n'));
        return;
      }

      let projectId: string | undefined;
      if (options.project) {
        const ctxPath = `${process.cwd()}/.dirgha/context.json`;
        try {
          const fs = await import('fs');
          const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
          projectId = ctx.projectId;
        } catch {
          console.log(chalk.yellow('\n  ⚠ No project context found. Run `dirgha init` first.\n'));
          return;
        }
      }

      console.log(chalk.dim('\n  Pushing knowledge to cloud...'));
      const result = await pushFacts(projectId);
      
      console.log(chalk.green(`\n  ✓ Uploaded ${result.uploaded} facts`));
      if (projectId) {
        console.log(chalk.dim(`  Project: ${projectId.slice(0, 8)}...`));
      }
      console.log(chalk.dim(`  Last sync: ${new Date(result.timestamp).toLocaleString()}`));
      console.log();
    });

  syncCmd
    .command('pull')
    .description('Pull knowledge from cloud to local')
    .option('-p, --project', 'Sync only current project')
    .action(async (options) => {
      const { isLoggedIn } = await import('../utils/credentials.js');
      if (!isLoggedIn()) {
        console.log(chalk.red('\n  ✗ Not authenticated. Run `dirgha login` first.\n'));
        return;
      }

      let projectId: string | undefined;
      if (options.project) {
        const ctxPath = `${process.cwd()}/.dirgha/context.json`;
        try {
          const fs = await import('fs');
          const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
          projectId = ctx.projectId;
        } catch {
          console.log(chalk.yellow('\n  ⚠ No project context found.\n'));
        }
      }

      console.log(chalk.dim('\n  Pulling knowledge from cloud...'));
      const result = await pullFacts(projectId);
      
      console.log(chalk.green(`\n  ✓ Downloaded ${result.downloaded} facts`));
      if (projectId) {
        console.log(chalk.dim(`  Project: ${projectId.slice(0, 8)}...`));
      }
      console.log(chalk.dim(`  Last sync: ${new Date(result.timestamp).toLocaleString()}`));
      console.log();
    });

  syncCmd
    .command('status')
    .description('Show sync status')
    .option('-p, --project', 'Show only current project status')
    .action(async (options) => {
      let projectId: string | undefined;
      if (options.project) {
        const ctxPath = `${process.cwd()}/.dirgha/context.json`;
        try {
          const fs = await import('fs');
          const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
          projectId = ctx.projectId;
        } catch {
          /* no project */
        }
      }

      const status = getSyncStatus(projectId);
      
      console.log(chalk.bold('\n  Knowledge Sync Status\n'));
      console.log(`  ${chalk.dim('Local facts:')} ${status.localFacts}`);
      if (status.lastSync) {
        const lastSync = new Date(status.lastSync);
        const ago = Math.floor((Date.now() - lastSync.getTime()) / 1000 / 60);
        const timeStr = ago < 1 ? 'just now' : ago < 60 ? `${ago}m ago` : `${Math.floor(ago / 60)}h ago`;
        console.log(`  ${chalk.dim('Last sync:')} ${timeStr}`);
      } else {
        console.log(`  ${chalk.dim('Last sync:')} ${chalk.yellow('Never')}`);
      }
      if (projectId) {
        console.log(`  ${chalk.dim('Project:')} ${projectId.slice(0, 8)}...`);
      }
      console.log();
    });
}
