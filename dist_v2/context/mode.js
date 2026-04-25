/**
 * Execution mode for the agent loop. Each mode is a short preamble
 * prepended to the system prompt; it doesn't change the tool set or
 * the loop structure. Used by /mode slash and CLI flags.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
export const MODES = ['plan', 'act', 'verify', 'ask'];
export const DEFAULT_MODE = 'act';
const MODE_PREAMBLES = {
    plan: [
        'Mode: PLAN.',
        'Produce a structured plan before acting. List the files you would read, the changes you would make, and the verification steps — but do NOT write files, run shell commands, or make git commits. Read-only tools (read_file, search_grep, search_glob, fs_ls, git_status) are fine. Ask for confirmation before leaving plan mode.',
    ].join('\n'),
    act: [
        'Mode: ACT.',
        'Execute the task end to end. Use tools as needed, write code, run shells, commit when asked. Report concisely on what you did.',
    ].join('\n'),
    verify: [
        'Mode: VERIFY.',
        'Treat the current state as a proposed change to audit. Read code, run tests and type-checkers, inspect git diffs — but do NOT modify files. Surface risks, test failures, and unverified assumptions. Return a pass/fail summary.',
    ].join('\n'),
    ask: [
        'Mode: ASK.',
        'Answer questions about the codebase. You may read files, search, list directories, and inspect git state — but you must NOT modify anything (no fs_write, no fs_edit, no shell, no git, no commits, no checkpoint, no browser). Keep answers terse, cite paths and line numbers, and if the question would require running code, say so explicitly instead of running it.',
    ].join('\n'),
};
export function modePreamble(mode) {
    return MODE_PREAMBLES[mode];
}
/**
 * Prepend the mode preamble to an existing system prompt. If the
 * caller already supplied one, the mode preamble is inserted first,
 * separated by a blank line. If no prompt is supplied, the preamble
 * stands on its own.
 */
export function applyMode(systemPrompt, mode) {
    const preamble = modePreamble(mode);
    if (!systemPrompt || systemPrompt.trim().length === 0)
        return preamble;
    return `${preamble}\n\n${systemPrompt}`;
}
function configPath() {
    return join(homedir(), '.dirgha', 'config.json');
}
async function readStoredConfig() {
    const text = await readFile(configPath(), 'utf8').catch(() => '');
    if (!text)
        return {};
    try {
        const parsed = JSON.parse(text);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    }
    catch {
        return {};
    }
}
async function writeStoredConfig(patch) {
    const current = await readStoredConfig();
    const merged = { ...current, ...patch };
    await mkdir(join(homedir(), '.dirgha'), { recursive: true });
    await writeFile(configPath(), JSON.stringify(merged, null, 2) + '\n', 'utf8');
}
/**
 * Resolve the active mode. Precedence:
 *   1. process.env.DIRGHA_MODE (for one-off override)
 *   2. ~/.dirgha/config.json's `mode` field
 *   3. DEFAULT_MODE ('act')
 */
export async function resolveMode() {
    const fromEnv = process.env['DIRGHA_MODE'];
    if (fromEnv && MODES.includes(fromEnv))
        return fromEnv;
    const cfg = await readStoredConfig();
    if (cfg.mode && MODES.includes(cfg.mode))
        return cfg.mode;
    return DEFAULT_MODE;
}
/** Persist the user's preferred mode. */
export async function saveMode(mode) {
    process.env['DIRGHA_MODE'] = mode;
    await writeStoredConfig({ mode });
}
//# sourceMappingURL=mode.js.map