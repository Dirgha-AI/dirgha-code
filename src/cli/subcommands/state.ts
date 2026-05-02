/**
 * `dirgha state` — query the unified session state index.
 *
 * Lists recent sessions with their cross-referenced checkpoints and
 * cron jobs. Use `--session <id>` to dump full details for one entry.
 */

import { listSessions, querySession } from '../../state/index.js';
import type { Subcommand } from './index.js';

export const stateSubcommand: Subcommand = {
  name: 'state',
  description: 'Query unified session state (sessions, checkpoints, cron jobs)',
  aliases: [],
  async run(args: string[]): Promise<number> {
    const sessionArg =
      args.find(a => a.startsWith('--session='))?.split('=')[1] ??
      (args[0] === '--session' ? args[1] : undefined);

    if (sessionArg) {
      const entry = await querySession(sessionArg);
      if (!entry) {
        process.stdout.write(`No session found: ${sessionArg}\n`);
        return 1;
      }
      process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
      return 0;
    }

    // List recent sessions
    const sessions = await listSessions(20);
    if (sessions.length === 0) {
      process.stdout.write('No sessions recorded yet.\n');
      return 0;
    }

    process.stdout.write(`Recent sessions (${sessions.length}):\n\n`);
    for (const s of sessions) {
      const status = s.endedAt ? 'done' : 'active';
      const started = new Date(s.startedAt).toLocaleString();
      process.stdout.write(
        `  ${s.sessionId.slice(0, 8)}  ${started}  ${status}` +
          (s.checkpointIds.length ? `  ckpt:${s.checkpointIds.length}` : '') +
          (s.cronJobIds.length ? `  cron:${s.cronJobIds.length}` : '') +
          (s.model ? `  [${s.model}]` : '') +
          '\n',
      );
    }
    process.stdout.write('\nUse: dirgha state --session <id> for full details\n');
    return 0;
  },
};
