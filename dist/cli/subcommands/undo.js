/**
 * `dirgha undo [N]` — discard the last N turns from a session.
 *
 * Sessions are append-only JSONL at `~/.dirgha/sessions/<id>.jsonl`.
 * "Undo" is implemented as a non-destructive rewrite: read the log,
 * count back N user-turns, snapshot the original to `<id>.jsonl.bak`,
 * write the truncated history. Future `dirgha resume <id>` then sees
 * the rolled-back state.
 *
 * Without --session, the most-recently-modified session is used.
 *
 * Closes parity-matrix row 16. We can't assume a clean git repo for
 * every workspace, so the session log is the source of truth — each
 * undo rewinds the JSONL to the chosen turn boundary.
 */
import { copyFile, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdout, stderr } from 'node:process';
import { style, defaultTheme } from '../../tui/theme.js';
function sessionsDir() {
    return join(homedir(), '.dirgha', 'sessions');
}
function parseFlag(argv, name) {
    const prefix = `--${name}=`;
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === `--${name}` && i + 1 < argv.length)
            return argv[i + 1];
        if (a.startsWith(prefix))
            return a.slice(prefix.length);
    }
    return undefined;
}
async function mostRecentSession() {
    const dir = sessionsDir();
    const names = await readdir(dir).catch(() => []);
    const jsonl = names.filter(n => n.endsWith('.jsonl'));
    if (jsonl.length === 0)
        return undefined;
    const stats = await Promise.all(jsonl.map(async (n) => {
        const s = await stat(join(dir, n)).catch(() => undefined);
        return { id: n.replace(/\.jsonl$/, ''), mtime: s?.mtimeMs ?? 0 };
    }));
    stats.sort((a, b) => b.mtime - a.mtime);
    return stats[0]?.id;
}
async function readEntries(path) {
    const text = await readFile(path, 'utf8').catch(() => '');
    const out = [];
    for (const line of text.split('\n')) {
        if (!line.trim())
            continue;
        try {
            out.push(JSON.parse(line));
        }
        catch { /* skip */ }
    }
    return out;
}
/**
 * Walk the entries from the tail and chop everything from the Nth-most-
 * recent user-turn onward. Returns the count of entries kept.
 */
function truncateAtUserTurn(entries, n) {
    let userTurnsSeen = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e.type === 'message' && e.message?.role === 'user') {
            userTurnsSeen++;
            if (userTurnsSeen === n)
                return entries.slice(0, i);
        }
    }
    // fewer than N user turns: discard everything
    return [];
}
function usage() {
    return [
        'usage:',
        '  dirgha undo [N]                   Roll back N user-turns from the latest session (default 1)',
        '  dirgha undo --session=<id> [N]    Target a specific session',
        '  dirgha undo --list                Show the current session\'s last 10 turns',
        '  dirgha undo --json                JSON output',
    ].join('\n');
}
export const undoSubcommand = {
    name: 'undo',
    description: 'Roll back the last N turns of a session (non-destructive — keeps a .bak)',
    async run(argv) {
        const json = argv.includes('--json');
        const list = argv.includes('--list');
        const sessionFlag = parseFlag(argv, 'session');
        const positionals = argv.filter(a => !a.startsWith('--') && a !== '--list' && a !== '--json');
        const n = positionals.length > 0 ? Number.parseInt(positionals[0], 10) : 1;
        if (!Number.isFinite(n) || n < 1) {
            stderr.write(`${usage()}\n`);
            return 1;
        }
        const sessionId = sessionFlag ?? await mostRecentSession();
        if (!sessionId) {
            stderr.write('No sessions found in ~/.dirgha/sessions/\n');
            return 1;
        }
        const path = join(sessionsDir(), `${sessionId}.jsonl`);
        const entries = await readEntries(path);
        if (entries.length === 0) {
            stderr.write(`Session ${sessionId} is empty.\n`);
            return 1;
        }
        if (list) {
            const tail = entries.filter(e => e.type === 'message').slice(-10);
            if (json) {
                stdout.write(`${JSON.stringify({ sessionId, tail })}\n`);
                return 0;
            }
            stdout.write(style(defaultTheme.accent, `\nLast 10 messages of ${sessionId}\n`));
            for (const e of tail) {
                const role = String(e.message?.role ?? '').padEnd(10);
                const ts = String(e.ts ?? '').slice(0, 19);
                stdout.write(`  ${style(defaultTheme.muted, ts)}  ${style(defaultTheme.accent, role)}\n`);
            }
            return 0;
        }
        const kept = truncateAtUserTurn(entries, n);
        const dropped = entries.length - kept.length;
        if (dropped === 0) {
            stdout.write(style(defaultTheme.muted, `(nothing to undo — fewer than ${n} user turns)\n`));
            return 0;
        }
        // Snapshot the original then write the truncated log.
        const backup = `${path}.bak`;
        await copyFile(path, backup);
        await writeFile(path, kept.map(e => JSON.stringify(e)).join('\n') + (kept.length > 0 ? '\n' : ''), 'utf8');
        if (json) {
            stdout.write(`${JSON.stringify({ sessionId, dropped, kept: kept.length, backup })}\n`);
            return 0;
        }
        stdout.write(style(defaultTheme.success, `✓ Rolled back ${n} user-turn${n === 1 ? '' : 's'} from ${sessionId}\n`));
        stdout.write(style(defaultTheme.muted, `  dropped ${dropped} entr${dropped === 1 ? 'y' : 'ies'}, kept ${kept.length}; backup at ${backup}\n`));
        return 0;
    },
};
//# sourceMappingURL=undo.js.map