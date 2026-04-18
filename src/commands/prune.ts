// SPDX-License-Identifier: BUSL-1.1
import { Command } from 'commander';
import chalk from 'chalk';
import { pruneSessions } from '../session/caps.js';
import { rotateSnapshots } from '../git/rotation.js';
import { readdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

function humanBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export function registerPruneCommand(program: Command): void {
  program
    .command('prune')
    .description('Prune old sessions, git snapshots, and cache')
    .option('--sessions', 'Prune sessions', false)
    .option('--git', 'Prune git snapshots', false)
    .option('--cache', 'Prune cache', false)
    .option('--dry-run', 'Show what would be deleted', false)
    .option('--json', 'Output JSON', false)
    .action(async (opts) => {
      const all = !opts.sessions && !opts.git && !opts.cache;
      const results: Record<string, unknown> = {};
      
      if (all || opts.sessions) {
        const r = await pruneSessions({ dryRun: opts.dryRun });
        results.sessions = r;
        if (!opts.json) {
          console.log(chalk.blue('Sessions:'), `kept ${r.kept}, removed ${r.removed.length} (${humanBytes(r.freedBytes)})`);
        }
      }
      
      if (all || opts.git) {
        const r = await rotateSnapshots({ dryRun: opts.dryRun });
        results.git = r;
        if (!opts.json) {
          console.log(chalk.blue('Git:'), `kept ${humanBytes(r.keptBytes)}, rotated ${r.rotated.length} (${humanBytes(r.freedBytes)})`);
        }
      }
      
      if (all || opts.cache) {
        const base = join(process.env.DIRGHA_HOME || homedir(), '.dirgha', 'cache');
        const entries = await readdir(base).catch(() => [] as string[]);
        let freed = 0;
        for (const e of entries) {
          const p = join(base, e);
          const s = await stat(p).catch(() => null);
          if (s) freed += s.size;
          if (!opts.dryRun) await rm(p, { recursive: true, force: true });
        }
        results.cache = { freedBytes: freed, entries: entries.length };
        if (!opts.json) {
          console.log(chalk.blue('Cache:'), `cleared ${entries.length} entries (${humanBytes(freed)})`);
        }
      }
      
      if (opts.json) {
        console.log(JSON.stringify(results));
      }
    });
}
