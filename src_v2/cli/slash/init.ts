/**
 * /init — drop a DIRGHA.md context primer into the current working
 * directory. Seeds a minimal project profile and a hint about running
 * `/setup` for API keys. Never overwrites an existing DIRGHA.md unless
 * invoked with --force.
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SlashCommand } from './types.js';

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

export const initCommand: SlashCommand = {
  name: 'init',
  description: 'Initialise DIRGHA.md in the current directory',
  async execute(args) {
    const force = args.includes('--force') || args.includes('-f');
    const cwd = process.cwd();
    const target = join(cwd, 'DIRGHA.md');
    const existing = await stat(target).then(() => true).catch(() => false);

    if (existing && !force) {
      const text = await readFile(target, 'utf8').catch(() => '');
      const firstLine = text.split('\n', 1)[0] ?? '';
      return [
        `DIRGHA.md already exists at ${target}.`,
        firstLine ? `  first line: ${firstLine}` : '',
        'Run `/init --force` to overwrite.',
      ].filter(Boolean).join('\n');
    }

    await writeFile(target, TEMPLATE, 'utf8');
    return `Wrote ${target}. Edit it to describe the project; dirgha reads it on every run.`;
  },
};
