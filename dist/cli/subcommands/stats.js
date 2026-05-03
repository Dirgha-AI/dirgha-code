/**
 * `dirgha stats` — session + token + cost aggregates.
 *
 * Reads the JSONL session files under `~/.dirgha/sessions/`, walking
 * every `usage` entry to compute totals. Subcommands narrow the time
 * window (today / week / month / all; defaults to `all`). Output is a
 * table by default, `--json` for structured output.
 *
 * By-model and by-day rollups are also emitted so the user can see
 * which model ate the budget and how usage trends over time.
 */
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdout, stderr } from 'node:process';
import { streamJsonl } from '../../context/session.js';
import { findPrice } from '../../intelligence/prices.js';
import { style, defaultTheme } from '../../tui/theme.js';
function empty() {
    return { sessions: 0, messages: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, byModel: {}, byDay: {} };
}
function windowStart(win) {
    const now = new Date();
    if (win === 'today') {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return d;
    }
    if (win === 'week') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return d;
    }
    if (win === 'month') {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        return d;
    }
    return undefined;
}
function costFor(model, input, output, cached) {
    for (const provider of ['anthropic', 'openai', 'gemini', 'nvidia', 'openrouter']) {
        const price = findPrice(provider, model);
        if (!price)
            continue;
        const cachedCost = price.cachedInputPerM !== undefined ? (cached / 1_000_000) * price.cachedInputPerM : 0;
        return ((input - cached) / 1_000_000) * price.inputPerM + cachedCost + (output / 1_000_000) * price.outputPerM;
    }
    return 0;
}
const MAX_SESSION_FILES = 100;
async function aggregate(win) {
    const dir = join(homedir(), '.dirgha', 'sessions');
    const allFiles = (await readdir(dir).catch(() => [])).filter(f => f.endsWith('.jsonl'));
    // Cap to the 100 most-recent files by mtime to prevent hanging on large stores.
    const filesWithMtime = await Promise.all(allFiles.map(async (f) => ({ f, mtime: (await stat(join(dir, f)).catch(() => ({ mtimeMs: 0 }))).mtimeMs })));
    filesWithMtime.sort((a, b) => b.mtime - a.mtime);
    const files = filesWithMtime.slice(0, MAX_SESSION_FILES).map(x => x.f);
    const since = windowStart(win);
    const agg = empty();
    for (const file of files) {
        if (!file.endsWith('.jsonl'))
            continue;
        agg.sessions += 1;
        let currentModel = 'unknown';
        const pushEntry = (entry) => {
            const ts = new Date(entry.ts);
            if (since && ts < since)
                return;
            const dayKey = entry.ts.slice(0, 10);
            if (entry.type === 'message') {
                agg.messages += 1;
                return;
            }
            if (entry.type === 'model_change') {
                currentModel = entry.to;
                return;
            }
            if (entry.type !== 'usage')
                return;
            agg.inputTokens += entry.usage.inputTokens;
            agg.outputTokens += entry.usage.outputTokens;
            agg.cachedTokens += entry.usage.cachedTokens;
            const cost = entry.usage.costUsd > 0
                ? entry.usage.costUsd
                : costFor(currentModel, entry.usage.inputTokens, entry.usage.outputTokens, entry.usage.cachedTokens);
            agg.costUsd += cost;
            const m = agg.byModel[currentModel] ?? { tokens: 0, costUsd: 0 };
            m.tokens += entry.usage.inputTokens + entry.usage.outputTokens;
            m.costUsd += cost;
            agg.byModel[currentModel] = m;
            const d = agg.byDay[dayKey] ?? { tokens: 0, costUsd: 0 };
            d.tokens += entry.usage.inputTokens + entry.usage.outputTokens;
            d.costUsd += cost;
            agg.byDay[dayKey] = d;
        };
        await streamJsonl(join(dir, file), pushEntry).catch(() => undefined);
    }
    return agg;
}
function formatTok(n) {
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000)
        return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}
function printTable(win, a) {
    const title = `Dirgha stats — ${win}`;
    stdout.write(`\n${style(defaultTheme.accent, title)}\n\n`);
    stdout.write(`  sessions       ${a.sessions}\n`);
    stdout.write(`  messages       ${a.messages}\n`);
    stdout.write(`  input tokens   ${formatTok(a.inputTokens)}\n`);
    stdout.write(`  output tokens  ${formatTok(a.outputTokens)}\n`);
    stdout.write(`  cached tokens  ${formatTok(a.cachedTokens)}\n`);
    stdout.write(`  cost usd       $${a.costUsd.toFixed(4)}\n`);
    const models = Object.entries(a.byModel).sort((x, y) => y[1].tokens - x[1].tokens).slice(0, 8);
    if (models.length > 0) {
        stdout.write(`\n${style(defaultTheme.userPrompt, 'by model')}\n`);
        for (const [model, s] of models) {
            stdout.write(`  ${model.padEnd(44)} ${formatTok(s.tokens).padStart(8)}  $${s.costUsd.toFixed(4)}\n`);
        }
    }
    const days = Object.entries(a.byDay).sort().slice(-14);
    if (days.length > 0) {
        stdout.write(`\n${style(defaultTheme.userPrompt, 'by day')}\n`);
        for (const [day, s] of days) {
            stdout.write(`  ${day}  ${formatTok(s.tokens).padStart(8)}  $${s.costUsd.toFixed(4)}\n`);
        }
    }
    stdout.write('\n');
}
export const statsSubcommand = {
    name: 'stats',
    description: 'Usage stats (sessions, tokens, cost) — today / week / month / all',
    async run(argv) {
        const json = argv.includes('--json');
        const rest = argv.filter(a => a !== '--json');
        const op = (rest[0] ?? 'all');
        const valid = ['today', 'week', 'month', 'all'];
        if (!valid.includes(op)) {
            stderr.write(`usage: dirgha stats [${valid.join('|')}] [--json]\n`);
            return 1;
        }
        const a = await aggregate(op);
        if (json)
            stdout.write(`${JSON.stringify({ window: op, ...a })}\n`);
        else
            printTable(op, a);
        return 0;
    },
};
//# sourceMappingURL=stats.js.map