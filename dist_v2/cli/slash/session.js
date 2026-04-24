/**
 * /session — list sessions, load, rename, or branch. Branching is
 * wired through `context/branch.ts`, which takes a provider pointer +
 * a summary model; the SlashContext exposes `getProvider()` +
 * `getSummaryModel()` + `getSession()` + `getSessionStore()` for this.
 */
import { rename, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { branchSession } from '../../context/branch.js';
function sessionPath(id) {
    return join(homedir(), '.dirgha', 'sessions', `${id}.jsonl`);
}
function usage() {
    return [
        'Usage:',
        '  /session list                  List saved sessions',
        '  /session load <id>             Resume a session',
        '  /session rename <old> <new>    Rename a session file',
        '  /session branch <name>         Branch the current session with a summary',
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
            const [, oldId, newId] = args;
            if (!oldId || !newId)
                return `Missing argument.\n${usage()}`;
            const fromPath = sessionPath(oldId);
            const toPath = sessionPath(newId);
            const oldExists = await stat(fromPath).then(() => true).catch(() => false);
            if (!oldExists)
                return `Session "${oldId}" not found.`;
            const newExists = await stat(toPath).then(() => true).catch(() => false);
            if (newExists)
                return `Session "${newId}" already exists — refusing to overwrite.`;
            await rename(fromPath, toPath);
            return `Renamed ${oldId} → ${newId}.`;
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