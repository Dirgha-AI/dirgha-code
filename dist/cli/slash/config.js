/**
 * /config — show or edit the DIRGHA.md in the current directory
 * inline. Subcommands: show (default), append <text>, path.
 * For destructive edits (rewrite) the command refuses and points at
 * /init --force.
 */
import { appendFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
function targetPath() {
    return join(process.cwd(), 'DIRGHA.md');
}
function usage() {
    return [
        'Usage:',
        '  /config                         Show DIRGHA.md',
        '  /config show                    Same as above',
        '  /config path                    Print the resolved file path',
        '  /config append <markdown>       Append a line to DIRGHA.md',
    ].join('\n');
}
export const configCommand = {
    name: 'config',
    description: 'Show or edit DIRGHA.md in the current directory',
    async execute(args) {
        const op = args[0] ?? 'show';
        const path = targetPath();
        if (op === 'path')
            return path;
        if (op === 'show') {
            const exists = await stat(path).then(() => true).catch(() => false);
            if (!exists)
                return `No DIRGHA.md at ${path}. Run /init to create one.`;
            const text = await readFile(path, 'utf8');
            return text.trimEnd();
        }
        if (op === 'append') {
            const body = args.slice(1).join(' ').trim();
            if (!body)
                return `Missing text to append.\n${usage()}`;
            const exists = await stat(path).then(() => true).catch(() => false);
            if (!exists)
                return `No DIRGHA.md at ${path}. Run /init first.`;
            await appendFile(path, `\n${body}\n`, 'utf8');
            return `Appended to ${path}.`;
        }
        return `Unknown subcommand "${op}".\n${usage()}`;
    },
};
//# sourceMappingURL=config.js.map