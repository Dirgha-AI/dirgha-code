/**
 * Message manipulation helpers. Pure functions over Message[].
 */
/**
 * Projection boundary: convert kernel-internal `AgentMessage[]` (which may
 * carry UI-only metadata) into the clean `Message[]` shape that providers
 * actually send to the LLM.
 *
 * Behaviour:
 *   - Filters out any entry with `hidden === true`.
 *   - Strips the `ui` field from the remaining entries.
 *   - Preserves order.
 *   - Pure: does not mutate the input array or its elements.
 *
 * This is the ONLY seam the agent loop should use when handing messages
 * off to a `Provider.stream` call. Keeping it a single function makes the
 * UI/LLM boundary auditable.
 */
export function convertToLlm(messages) {
    const out = [];
    for (const m of messages) {
        if (m.hidden === true)
            continue;
        // Destructure to strip ui/hidden without mutating the original.
        const { ui: _ui, hidden: _hidden, ...rest } = m;
        out.push(rest);
    }
    return out;
}
export function normaliseContent(msg) {
    if (typeof msg.content === 'string') {
        return msg.content.length > 0 ? [{ type: 'text', text: msg.content }] : [];
    }
    return msg.content;
}
export function extractText(msg) {
    return normaliseContent(msg)
        .filter((p) => p.type === 'text')
        .map(p => p.text)
        .join('');
}
export function extractToolUses(msg) {
    return normaliseContent(msg).filter((p) => p.type === 'tool_use');
}
export function toolResultMessage(toolUseId, content, isError = false) {
    const part = { type: 'tool_result', toolUseId, content, isError };
    return { role: 'user', content: [part] };
}
export function appendToolResults(history, results) {
    if (results.length === 0)
        return history;
    const parts = results.map(r => ({
        type: 'tool_result',
        toolUseId: r.toolUseId,
        content: r.content,
        isError: r.isError,
    }));
    return [...history, { role: 'user', content: parts }];
}
export function assembleTurn(events) {
    const parts = [];
    let textBuf = '';
    let thinkingBuf = '';
    const toolJsonBuf = new Map();
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    const flushText = () => {
        if (textBuf.length > 0) {
            parts.push({ type: 'text', text: textBuf });
            textBuf = '';
        }
    };
    const flushThinking = () => {
        if (thinkingBuf.length > 0) {
            parts.push({ type: 'thinking', text: thinkingBuf });
            thinkingBuf = '';
        }
    };
    for (const ev of events) {
        switch (ev.type) {
            case 'text_delta':
                textBuf += ev.delta;
                break;
            case 'text_end':
                flushText();
                break;
            case 'thinking_delta':
                thinkingBuf += ev.delta;
                break;
            case 'thinking_end':
                flushThinking();
                break;
            case 'toolcall_start':
                flushText();
                flushThinking();
                toolJsonBuf.set(ev.id, { name: ev.name, json: '' });
                break;
            case 'toolcall_delta': {
                const entry = toolJsonBuf.get(ev.id);
                if (entry)
                    entry.json += ev.deltaJson;
                break;
            }
            case 'toolcall_end': {
                const entry = toolJsonBuf.get(ev.id);
                const input = ev.input ?? (entry ? safeParse(entry.json) : {});
                parts.push({ type: 'tool_use', id: ev.id, name: entry?.name ?? '', input });
                toolJsonBuf.delete(ev.id);
                break;
            }
            case 'usage':
                inputTokens += ev.inputTokens;
                outputTokens += ev.outputTokens;
                cachedTokens += ev.cachedTokens ?? 0;
                break;
        }
    }
    flushText();
    flushThinking();
    return {
        message: { role: 'assistant', content: parts },
        inputTokens,
        outputTokens,
        cachedTokens,
    };
}
function safeParse(json) {
    if (!json)
        return {};
    try {
        return JSON.parse(json);
    }
    catch {
        return {};
    }
}
/** Rough cl100k heuristic: ~4 characters per token. */
export function estimateTokens(text) {
    if (!text)
        return 0;
    return Math.ceil(text.length / 4);
}
//# sourceMappingURL=message.js.map