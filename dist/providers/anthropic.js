/**
 * Anthropic provider. Uses the Messages API (/v1/messages) with its own
 * SSE event shape (content_block_start, content_block_delta,
 * content_block_stop, message_delta, message_stop). Event-to-kernel
 * mapping is bespoke; it does not share the openai-compat adapter.
 */
import { ProviderError } from './iface.js';
import { streamSSE } from './http.js';
import { ANTHROPIC_BY_ID } from './anthropic-catalogue.js';
const DEFAULT_BASE = 'https://api.anthropic.com/v1';
const DEFAULT_VERSION = '2023-06-01';
export class AnthropicProvider {
    id = 'anthropic';
    apiKey;
    baseUrl;
    version;
    timeoutMs;
    constructor(config) {
        this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
        if (!this.apiKey)
            throw new ProviderError('ANTHROPIC_API_KEY is required', this.id);
        this.baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
        this.version = config.version ?? DEFAULT_VERSION;
        this.timeoutMs = config.timeoutMs ?? 60_000;
    }
    supportsTools(_modelId) {
        return true;
    }
    supportsThinking(modelId) {
        const bare = modelId.replace(/^anthropic\//, '');
        return (ANTHROPIC_BY_ID.get(bare)?.thinkingMode ?? 'none') !== 'none';
    }
    async *stream(req) {
        const model = req.model.replace(/^anthropic\//, '');
        const { system, messages } = splitSystem(req.messages);
        const body = {
            model,
            messages: messages.map(toAnthropicMessage),
            max_tokens: req.maxTokens ?? 4096,
            stream: true,
        };
        if (system)
            body.system = system;
        if (req.temperature !== undefined)
            body.temperature = req.temperature;
        if (req.tools && req.tools.length > 0) {
            body.tools = req.tools.map(t => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema ?? { type: 'object', properties: {} },
            }));
        }
        if (req.thinking && req.thinking !== 'off' && this.supportsThinking(req.model)) {
            const budget = req.thinking === 'low' ? 1024 : req.thinking === 'medium' ? 4096 : 16384;
            body.thinking = { type: 'enabled', budget_tokens: budget };
        }
        const state = new AnthropicState();
        for await (const payload of streamSSE({
            providerName: this.id,
            url: `${this.baseUrl}/messages`,
            apiKey: this.apiKey,
            body,
            signal: req.signal,
            timeoutMs: this.timeoutMs,
            extraHeaders: {
                'x-api-key': this.apiKey,
                'anthropic-version': this.version,
            },
        })) {
            let event;
            try {
                event = JSON.parse(payload);
            }
            catch {
                continue;
            }
            yield* state.ingest(event);
        }
    }
}
function splitSystem(messages) {
    const systemTexts = [];
    const rest = [];
    for (const m of messages) {
        if (m.role === 'system') {
            const t = typeof m.content === 'string'
                ? m.content
                : m.content.filter((p) => p.type === 'text').map(p => p.text).join('');
            systemTexts.push(t);
        }
        else {
            rest.push(m);
        }
    }
    return { system: systemTexts.length > 0 ? systemTexts.join('\n\n') : undefined, messages: rest };
}
function toAnthropicMessage(msg) {
    if (typeof msg.content === 'string') {
        return { role: msg.role === 'assistant' ? 'assistant' : 'user', content: [{ type: 'text', text: msg.content }] };
    }
    const blocks = [];
    for (const p of msg.content) {
        if (p.type === 'text')
            blocks.push({ type: 'text', text: p.text });
        else if (p.type === 'thinking')
            blocks.push({ type: 'thinking', thinking: p.text });
        else if (p.type === 'tool_use')
            blocks.push({ type: 'tool_use', id: p.id, name: p.name, input: p.input ?? {} });
        else if (p.type === 'tool_result')
            blocks.push({ type: 'tool_result', tool_use_id: p.toolUseId, content: p.content });
    }
    return { role: msg.role === 'assistant' ? 'assistant' : 'user', content: blocks };
}
class AnthropicState {
    blocks = new Map();
    *ingest(ev) {
        switch (ev.type) {
            case 'content_block_start': {
                const index = ev.index ?? 0;
                const block = ev.content_block;
                if (!block)
                    return;
                if (block.type === 'text') {
                    this.blocks.set(index, { kind: 'text', buffer: '' });
                    yield { type: 'text_start' };
                }
                else if (block.type === 'thinking') {
                    this.blocks.set(index, { kind: 'thinking', buffer: '' });
                    yield { type: 'thinking_start' };
                }
                else if (block.type === 'tool_use') {
                    const id = block.id ?? `tu-${index}`;
                    this.blocks.set(index, { kind: 'tool', id, name: block.name ?? '', buffer: '' });
                    yield { type: 'toolcall_start', id, name: block.name ?? '' };
                }
                break;
            }
            case 'content_block_delta': {
                const index = ev.index ?? 0;
                const entry = this.blocks.get(index);
                if (!entry)
                    return;
                if (entry.kind === 'text' && ev.delta?.text) {
                    entry.buffer += ev.delta.text;
                    yield { type: 'text_delta', delta: ev.delta.text };
                }
                else if (entry.kind === 'thinking' && ev.delta?.thinking) {
                    entry.buffer += ev.delta.thinking;
                    yield { type: 'thinking_delta', delta: ev.delta.thinking };
                }
                else if (entry.kind === 'tool' && ev.delta?.partial_json) {
                    entry.buffer += ev.delta.partial_json;
                    yield { type: 'toolcall_delta', id: entry.id, deltaJson: ev.delta.partial_json };
                }
                break;
            }
            case 'content_block_stop': {
                const index = ev.index ?? 0;
                const entry = this.blocks.get(index);
                if (!entry)
                    return;
                if (entry.kind === 'text')
                    yield { type: 'text_end' };
                else if (entry.kind === 'thinking')
                    yield { type: 'thinking_end' };
                else if (entry.kind === 'tool') {
                    let input = {};
                    try {
                        input = entry.buffer ? JSON.parse(entry.buffer) : {};
                    }
                    catch {
                        input = {};
                    }
                    yield { type: 'toolcall_end', id: entry.id, input };
                }
                this.blocks.delete(index);
                break;
            }
            case 'message_delta': {
                if (ev.usage) {
                    yield {
                        type: 'usage',
                        inputTokens: ev.usage.input_tokens ?? 0,
                        outputTokens: ev.usage.output_tokens ?? 0,
                        cachedTokens: ev.usage.cache_read_input_tokens ?? 0,
                    };
                }
                break;
            }
        }
    }
}
//# sourceMappingURL=anthropic.js.map