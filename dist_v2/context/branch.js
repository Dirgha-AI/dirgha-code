/**
 * Session branching: create a new session whose first message is a
 * summary of the parent, so the child inherits context without dragging
 * the full parent transcript. Branch metadata is logged to both parent
 * and child.
 */
import { randomUUID } from 'node:crypto';
export async function branchSession(parent, store, opts) {
    const parentMessages = await parent.messages();
    const summary = await summariseParent(opts.summarizer, opts.summaryModel, parentMessages);
    const childId = `${parent.id}-${opts.name}-${randomUUID().slice(0, 8)}`;
    const child = await store.create(childId);
    const ts = new Date().toISOString();
    await child.append({ type: 'branch', ts, parentId: parent.id, name: opts.name });
    await child.append({
        type: 'message',
        ts,
        message: {
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: `[Branched from session ${parent.id} (${opts.name})]\n${summary}\n[End parent summary]`,
                },
            ],
        },
    });
    await parent.append({ type: 'branch', ts, parentId: parent.id, name: opts.name });
    return { child, summary };
}
async function summariseParent(provider, model, messages) {
    if (messages.length === 0)
        return '[Empty parent session]';
    const transcript = messages.map(renderMessage).join('\n\n');
    const prompt = [
        {
            role: 'system',
            content: 'Summarise this conversation so that a resuming agent has enough context to continue. Keep decisions, file paths, tool outcomes, and open questions. Omit pleasantries.',
        },
        {
            role: 'user',
            content: `Summarise below in plain text under ~600 tokens.\n\n${transcript}`,
        },
    ];
    let out = '';
    for await (const ev of provider.stream({ model, messages: prompt })) {
        if (ev.type === 'text_delta')
            out += ev.delta;
    }
    return out.trim() || '[Empty summary]';
}
function renderMessage(msg) {
    const text = typeof msg.content === 'string'
        ? msg.content
        : msg.content.map(p => {
            if (p.type === 'text' || p.type === 'thinking')
                return p.text;
            if (p.type === 'tool_use')
                return `(tool ${p.name})`;
            if (p.type === 'tool_result')
                return `(result)`;
            return '';
        }).join(' ');
    return `${msg.role}: ${text}`;
}
//# sourceMappingURL=branch.js.map