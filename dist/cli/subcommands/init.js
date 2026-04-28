/**
 * `dirgha init [path]` — scaffold DIRGHA.md in `path` (default: cwd).
 *
 * Refuses to overwrite an existing DIRGHA.md unless `--force` is
 * passed, in which case it replaces the file and prints the old first
 * line as a reference. Mirrors the REPL `/init` slash but lets the
 * user target a subdirectory directly from the shell.
 */
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { stdout, stderr } from 'node:process';
import { style, defaultTheme } from '../../tui/theme.js';
const TEMPLATE = `# DIRGHA.md

This file gives dirgha-cli persistent project context. Everything below
is read as a system primer on every run.

## Project summary

<!-- describe what this repo is, top-level goals, who maintains it -->

## Conventions

<!-- language, formatter, test command, branch naming, commit style -->

## Gotchas

<!-- known flaky tests, tricky build steps, secrets-never-commit rules -->

## Useful commands

\`\`\`bash
# tests
npm test

# type-check
npx tsc --noEmit
\`\`\`
`;
async function readFirstLine(path) {
    const text = await readFile(path, 'utf8').catch(() => '');
    return text.split('\n', 1)[0] ?? '';
}
export const initSubcommand = {
    name: 'init',
    description: 'Initialise DIRGHA.md in a project directory',
    async run(argv, ctx) {
        const force = argv.includes('--force') || argv.includes('-f');
        const positional = argv.find(a => !a.startsWith('-'));
        const targetDir = positional ? resolve(ctx.cwd, positional) : ctx.cwd;
        const target = join(targetDir, 'DIRGHA.md');
        const existing = await stat(target).then(() => true).catch(() => false);
        if (existing && !force) {
            const firstLine = await readFirstLine(target);
            stdout.write(`${style(defaultTheme.warning, 'DIRGHA.md exists')} at ${target}\n`);
            if (firstLine)
                stdout.write(`  first line: ${firstLine}\n`);
            stdout.write(`Run with --force to overwrite.\n`);
            return 0;
        }
        try {
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, TEMPLATE, 'utf8');
            stdout.write(`${style(defaultTheme.success, '✓')} wrote ${target}\n`);
            stdout.write(`Edit it to describe the project; dirgha reads it on every run.\n`);
            return 0;
        }
        catch (err) {
            stderr.write(`failed to write ${target}: ${err instanceof Error ? err.message : String(err)}\n`);
            return 1;
        }
    },
};
//# sourceMappingURL=init.js.map