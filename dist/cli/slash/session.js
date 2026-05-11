/**
 * /session — list sessions, load, rename, or branch. Branching is
 * wired through `context/branch.ts`, which takes a provider pointer +
 * a summary model; the SlashContext exposes `getProvider()` +
 * `getSummaryModel()` + `getSession()` + `getSessionStore()` for this.
 */
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { branchSession } from '../../context/branch.js';
import { renameSession } from '../../state/index.js';
function sessionPath(id) {
    if (!id || basename(id) !== id || id.includes('\0')) {
        throw new Error(`Invalid session id: "${id}"`);
    }
    return join(homedir(), '.dirgha', 'sessions', `${id}.jsonl`);
}
function usage() {
    return [
        'Usage:',
        '  /session list                        List saved sessions (20 most recent)',
        '  /session load <id>                   Resume a session',
        '  /session rename <id> <title>         Give a session a human-readable name',
        '  /session branch <name>               Branch the current session with a summary',
    ].join('\n');
}
export const sessionCommand = {
    name: 'session',
    description: 'Session management: list / load / rename / branch',
    async execute(args, ctx) {
        const op = args[0];
        if (!op || op === 'list')
            return ctx.listSessions();
        if (op === 'load' && args[1])
            return ctx.loadSession(args[1]);
        if (op === 'rename') {
            const id = args[1];
            const title = args.slice(2).join(" ");
            if (!id || !title)
                return `Missing argument.\n${usage()}`;
            const ok = await renameSession(id, title);
            if (!ok)
                return `Session "${id}" not found.`;
            return `Session "${id.slice(0, 12)}…" renamed to "${title}".`;
        }
        if (op === 'branch') {
            const name = args.slice(1).join('-');
            if (!name)
                return `Missing branch name.\n${usage()}`;
            const parent = ctx.getSession();
            const store = ctx.getSessionStore();
            const provider = ctx.getProvider();
            const summaryModel = ctx.getSummaryModel();
            if (!parent || !store)
                return 'No active session to branch from.';
            if (!provider)
                return 'No provider configured — cannot summarise parent context.';
            const { child, summary } = await branchSession(parent, store, {
                name,
                summarizer: provider,
                summaryModel,
            });
            return [
                `Branched → ${child.id}`,
                '',
                'Summary carried into child:',
                summary.split('\n').map(l => `  ${l}`).join('\n'),
            ].join('\n');
        }
        return `Unknown subcommand "${op}".\n${usage()}`;
    },
};
//# sourceMappingURL=session.js.map