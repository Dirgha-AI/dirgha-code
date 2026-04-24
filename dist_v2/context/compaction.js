/**
 * Context compaction.
 *
 * When the total token estimate of the running history crosses a
 * threshold, summarise the older portion via a provider call and return
 * a trimmed history that contains the system prompt, a synthetic user
 * summary, and the last N preserved turns. A compaction log entry is
 * written to the session so the operation is auditable.
 */
import { estimateTokens, normaliseContent } from '../kernel/message.js';
export async function maybeCompact(messages, cfg, session) {
    const tokensBefore = messages.reduce((acc, m) => acc + estimateTokens(flatten(m)), 0);
    if (tokensBefore < cfg.triggerTokens) {
        return { messages, compacted: false, tokensBefore, tokensAfter: tokensBefore };
    }
    const { systems, rest } = splitSystems(messages);
    const preserveCount = countPreservedMessages(rest, cfg.preserveLastTurns);
    const historical = rest.slice(0, rest.length - preserveCount);
    const preserved = rest.slice(rest.length - preserveCount);
    if (historical.length === 0) {
        return { messages, compacted: false, tokensBefore, tokensAfter: tokensBefore };
    }
    const summary = await summarise(cfg, historical);
    const trimmed = [
        ...systems,
        {
            role: 'user',
            content: [
                { type: 'text', text: `[Compacted summary of earlier turns]\n${summary}\n[End compacted summary]` },
            ],
        },
        ...preserved,
    ];
    const tokensAfter = trimmed.reduce((acc, m) => acc + estimateTokens(flatten(m)), 0);
    if (session) {
        await session.append({
            type: 'compaction',
            ts: new Date().toISOString(),
            keptFrom: `last-${preserveCount}-messages`,
            summary,
        });
    }
    return { messages: trimmed, compacted: true, summary, tokensBefore, tokensAfter };
}
async function summarise(cfg, historical) {
    const transcript = historical.map(renderForSummary).join('\n\n');
    const prompt = [
        {
            role: 'system',
            content: 'You summarise a coding agent conversation. Keep the summary terse, information-dense, ordered by topic. Retain every decision, file path, tool outcome, and open question. Omit greetings and pleasantries. Do not invent facts.',
        },
        {
            role: 'user',
            content: `Summarise the following transcript. Produce a single plain-text summary under ${cfg.maxSummaryTokens ?? 800} tokens.\n\n${transcript}`,
        },
    ];
    let summary = '';
    for await (const ev of cfg.summarizer.stream({ model: cfg.summaryModel, messages: prompt })) {
        if (ev.type === 'text_delta')
            summary += ev.delta;
    }
    return summary.trim() || '[Empty summary]';
}
function renderForSummary(msg) {
    const body = normaliseContent(msg).map(p => {
        switch (p.type) {
            case 'text': return p.text;
            case 'thinking': return `(thinking) ${p.text}`;
            case 'tool_use': return `(tool_use ${p.name}: ${truncate(JSON.stringify(p.input), 240)})`;
            case 'tool_result': return `(tool_result ${p.toolUseId}${p.isError ? ' ERROR' : ''}: ${truncate(p.content, 360)})`;
        }
    }).join('\n');
    return `### ${msg.role}\n${body}`;
}
function flatten(msg) {
    if (typeof msg.content === 'string')
        return msg.content;
    return msg.content.map(p => {
        if (p.type === 'text')
            return p.text;
        if (p.type === 'thinking')
            return p.text;
        if (p.type === 'tool_use')
            return JSON.stringify(p.input);
        if (p.type === 'tool_result')
            return p.content;
        return '';
    }).join(' ');
}
function splitSystems(messages) {
    const systems = [];
    const rest = [];
    for (const m of messages) {
        if (m.role === 'system')
            systems.push(m);
        else
            rest.push(m);
    }
    return { systems, rest };
}
function countPreservedMessages(rest, preserveLastTurns) {
    if (preserveLastTurns <= 0)
        return 0;
    let turns = 0;
    let count = 0;
    for (let i = rest.length - 1; i >= 0; i--) {
        count++;
        if (rest[i].role === 'user') {
            turns++;
            if (turns >= preserveLastTurns)
                break;
        }
    }
    return count;
}
function truncate(s, max) {
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
void undefined;
//# sourceMappingURL=compaction.js.map