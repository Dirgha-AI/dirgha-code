/**
 * Code search using ripgrep when available, with a conservative fallback
 * to a Node-native line scan. Always returns file:line:match triples,
 * capped by resultLimit to keep the LLM reply compact.
 */
import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const DEFAULT_LIMIT = 200;
export const searchGrepTool = {
    name: 'search_grep',
    description: 'Search for a regex pattern across files under a directory. Prefers ripgrep when installed.',
    inputSchema: {
        type: 'object',
        properties: {
            pattern: { type: 'string' },
            path: { type: 'string' },
            resultLimit: { type: 'integer', minimum: 1 },
            ignoreCase: { type: 'boolean' },
            filePattern: { type: 'string', description: 'Glob to limit files (ripgrep --glob).' },
        },
        required: ['pattern'],
    },
    async execute(rawInput, ctx) {
        const input = rawInput;
        const root = resolve(ctx.cwd, input.path ?? '.');
        const limit = input.resultLimit ?? DEFAULT_LIMIT;
        const rg = await runRipgrep(input, root, limit);
        if (rg)
            return rg;
        return nodeScan(input, root, limit);
    },
};
async function runRipgrep(input, root, limit) {
    const args = ['--line-number', '--no-heading', '--color', 'never', `--max-count=${limit}`];
    if (input.ignoreCase)
        args.push('--ignore-case');
    if (input.filePattern)
        args.push('--glob', input.filePattern);
    args.push('--', input.pattern, root);
    const child = spawn('rg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const errChunks = [];
    child.stdout.on('data', (buf) => { out.push(buf.toString('utf8')); });
    child.stderr.on('data', (buf) => { errChunks.push(buf); });
    const exitCode = await new Promise((resolveExit, rejectExit) => {
        child.on('error', err => rejectExit(err));
        child.on('exit', code => resolveExit(code ?? -1));
    }).catch(() => -1);
    if (exitCode === -1 || exitCode === 2)
        return undefined;
    const joined = out.join('');
    const lines = joined.length > 0 ? joined.split('\n').filter(l => l.length > 0) : [];
    const truncated = lines.length >= limit;
    return {
        content: lines.length > 0 ? lines.join('\n') : '(no matches)',
        data: { matches: lines.length, truncated, engine: 'ripgrep' },
        isError: false,
    };
}
async function nodeScan(input, root, limit) {
    const flags = input.ignoreCase ? 'gi' : 'g';
    let regex;
    try {
        regex = new RegExp(input.pattern, flags);
    }
    catch (err) {
        return { content: `Invalid regex: ${String(err)}`, isError: true };
    }
    const matches = [];
    let truncated = false;
    async function walk(dir) {
        if (matches.length >= limit) {
            truncated = true;
            return;
        }
        const names = await readdir(dir).catch(() => []);
        for (const name of names) {
            if (name === 'node_modules' || name === '.git' || name === 'dist')
                continue;
            const abs = join(dir, name);
            const info = await stat(abs).catch(() => undefined);
            if (!info)
                continue;
            if (info.isDirectory())
                await walk(abs);
            else if (info.isFile() && info.size < 512 * 1024) {
                const text = await readFile(abs, 'utf8').catch(() => '');
                const lines = text.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    regex.lastIndex = 0; // reset state between tests — global-flag RegExp retains lastIndex
                    if (regex.test(lines[i])) {
                        matches.push(`${abs}:${i + 1}:${lines[i]}`);
                        if (matches.length >= limit) {
                            truncated = true;
                            return;
                        }
                    }
                }
            }
        }
    }
    await walk(root);
    return {
        content: matches.length > 0 ? matches.join('\n') : '(no matches)',
        data: { matches: matches.length, truncated, engine: 'node' },
        isError: false,
    };
}
//# sourceMappingURL=search-grep.js.map