/**
 * `dirgha cost` — read the audit log and report cumulative token usage
 * + USD spend, grouped by day and model. The audit log already records
 * a `turn-end` entry per turn with `model` and `usage`; we just need to
 * fold them through `findPrice` to surface dollars.
 *
 * Subcommands (all read-only):
 *   today            Today's totals (default)
 *   day <YYYY-MM-DD> Totals for a specific date
 *   week             Last 7 days
 *   all              Everything in the audit log
 *   --json           Machine-readable output
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdout, stderr } from 'node:process';
import { findPrice } from '../../intelligence/prices.js';
import { routeModel } from '../../providers/dispatch.js';
import { style, defaultTheme } from '../../tui/theme.js';
function auditPath() {
    return join(homedir(), '.dirgha', 'audit', 'events.jsonl');
}
async function readTurnEnds() {
    const text = await readFile(auditPath(), 'utf8').catch(() => '');
    const out = [];
    for (const line of text.split('\n')) {
        if (!line.trim())
            continue;
        try {
            const e = JSON.parse(line);
            if (e.kind === 'turn-end' && e.model && e.usage)
                out.push(e);
        }
        catch { /* skip malformed */ }
    }
    return out;
}
function tokensToCost(model, usage) {
    const provider = routeModel(model);
    const price = findPrice(provider, model);
    if (!price)
        return 0;
    const i = (usage.inputTokens ?? 0) / 1_000_000 * price.inputPerM;
    const o = (usage.outputTokens ?? 0) / 1_000_000 * price.outputPerM;
    const c = (usage.cachedTokens ?? 0) / 1_000_000 * (price.cachedInputPerM ?? 0);
    return i + o + c;
}
function aggregate(entries) {
    const byModel = new Map();
    for (const e of entries) {
        if (!e.model || !e.usage)
            continue;
        const slot = byModel.get(e.model) ?? { model: e.model, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, turns: 0 };
        slot.inputTokens += e.usage.inputTokens ?? 0;
        slot.outputTokens += e.usage.outputTokens ?? 0;
        slot.cachedTokens += e.usage.cachedTokens ?? 0;
        slot.costUsd += tokensToCost(e.model, e.usage);
        slot.turns += 1;
        byModel.set(e.model, slot);
    }
    return [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd);
}
function fmt(n) {
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000)
        return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}
function emit(label, totals, json) {
    if (json) {
        stdout.write(`${JSON.stringify({ label, totals })}\n`);
        return;
    }
    if (totals.length === 0) {
        stdout.write(style(defaultTheme.muted, `(no usage recorded for ${label})\n`));
        return;
    }
    let totalCost = 0, totalTurns = 0, totalIn = 0, totalOut = 0;
    stdout.write(style(defaultTheme.accent, `\n${label}\n`));
    stdout.write(style(defaultTheme.muted, `  ${'model'.padEnd(40)}  ${'turns'.padStart(6)}  ${'in'.padStart(8)}  ${'out'.padStart(8)}  ${'cost'.padStart(10)}\n`));
    for (const t of totals) {
        totalCost += t.costUsd;
        totalTurns += t.turns;
        totalIn += t.inputTokens;
        totalOut += t.outputTokens;
        const cost = t.costUsd > 0 ? `$${t.costUsd.toFixed(4)}` : style(defaultTheme.muted, 'free');
        stdout.write(`  ${t.model.padEnd(40).slice(0, 40)}  ${String(t.turns).padStart(6)}  ${fmt(t.inputTokens).padStart(8)}  ${fmt(t.outputTokens).padStart(8)}  ${cost.padStart(10)}\n`);
    }
    stdout.write(style(defaultTheme.muted, `  ${''.padEnd(40, '-')}  ${'-'.padStart(6, '-')}  ${'-'.padStart(8, '-')}  ${'-'.padStart(8, '-')}  ${'-'.padStart(10, '-')}\n`));
    stdout.write(`  ${style(defaultTheme.accent, 'TOTAL'.padEnd(40))}  ${String(totalTurns).padStart(6)}  ${fmt(totalIn).padStart(8)}  ${fmt(totalOut).padStart(8)}  ${('$' + totalCost.toFixed(4)).padStart(10)}\n\n`);
}
function isoDay(d) {
    return d.toISOString().slice(0, 10);
}
function usage() {
    return [
        'usage:',
        '  dirgha cost                  Today (default)',
        '  dirgha cost today            Today',
        '  dirgha cost day <YYYY-MM-DD> Specific day',
        '  dirgha cost week             Last 7 days',
        '  dirgha cost all              Everything',
        '  dirgha cost ... --json       JSON output',
    ].join('\n');
}
export const costSubcommand = {
    name: 'cost',
    description: 'Cumulative token usage + USD spend from the audit log',
    async run(argv) {
        const json = argv.includes('--json');
        const args = argv.filter(a => a !== '--json');
        const op = args[0] ?? 'today';
        const all = await readTurnEnds();
        if (op === 'today' || op === '') {
            const day = isoDay(new Date());
            emit(day, aggregate(all.filter(e => e.ts.startsWith(day))), json);
            return 0;
        }
        if (op === 'day') {
            const day = args[1];
            if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
                stderr.write(`${usage()}\n`);
                return 1;
            }
            emit(day, aggregate(all.filter(e => e.ts.startsWith(day))), json);
            return 0;
        }
        if (op === 'week') {
            const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            emit('last 7 days', aggregate(all.filter(e => e.ts >= cutoff)), json);
            return 0;
        }
        if (op === 'all') {
            emit('all-time', aggregate(all), json);
            return 0;
        }
        stderr.write(`unknown subcommand "${op}"\n${usage()}\n`);
        return 1;
    },
};
//# sourceMappingURL=cost.js.map