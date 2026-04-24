/**
 * /session — list sessions, rename one, or branch from the current
 * session. The core SlashContext has list/load helpers; rename and
 * branch are handled at the file-system level (rename) or via a
 * stub message (branch, because branching needs a provider pointer
 * that we don't have access to here).
 */
import { rename, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
function sessionPath(id) {
    return join(homedir(), '.dirgha', 'sessions', `${id}.jsonl`);
}
function usage() {
    return [
        'Usage:',
        '  /session list                  List saved sessions',
        '  /session load <id>             Resume a session',
        '  /session rename <old> <new>    Rename a session file',
        '  /session branch <name>         Branch the current session (stub)',
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
            return [
                `Branching from ${ctx.sessionId} with name "${name}" is not yet wired into the`,
                'REPL — branchSession() requires provider access that the REPL context',
                'does not expose. Run it via `dirgha session branch` on the CLI once',
                'that command lands. STUB.',
            ].join('\n');
        }
        return `Unknown subcommand "${op}".\n${usage()}`;
    },
};
//# sourceMappingURL=session.js.map