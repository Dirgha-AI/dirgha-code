/**
 * Google Gemini provider.
 *
 * Uses generativelanguage.googleapis.com v1beta with streamGenerateContent.
 * Gemini's wire format is JSON-array-over-SSE rather than delta
 * envelopes, so this adapter has its own ingest loop.
 */
import { ProviderError } from './iface.js';
import { GEMINI_BY_ID } from './gemini-catalogue.js';
const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export class GeminiProvider {
    id = 'gemini';
    apiKey;
    baseUrl;
    timeoutMs;
    constructor(config) {
        this.apiKey = config.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
        if (!this.apiKey)
            throw new ProviderError('GEMINI_API_KEY or GOOGLE_API_KEY is required', this.id);
        this.baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
        this.timeoutMs = config.timeoutMs ?? 60_000;
    }
    supportsTools(_modelId) {
        return true;
    }
    supportsThinking(modelId) {
        const bare = modelId.replace(/^(google|gemini)\//, '').replace(/^gemini-/, '');
        const withPrefix = bare.startsWith('gemini-') ? bare : `gemini-${bare}`;
        return (GEMINI_BY_ID.get(withPrefix)?.thinkingMode ?? 'none') !== 'none';
    }
    async *stream(req) {
        const model = req.model.replace(/^(google|gemini)\//, '').replace(/^gemini-/, '');
        const url = `${this.baseUrl}/models/gemini-${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;
        const useThinking = this.supportsThinking(req.model) && req.thinking && req.thinking !== 'off';
        const thinkingParam = useThinking ? (GEMINI_BY_ID.get(`gemini-${model}`)?.thinkingParam ?? null) : null;
        const body = buildGeminiBody(req, thinkingParam);
        const { signal, cancel } = makeTimeoutSignal(this.timeoutMs, req.signal);
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
                body: JSON.stringify(body),
                signal,
            });
        }
        catch (err) {
            cancel();
            throw new ProviderError(`Network error: ${String(err?.message ?? err)}`, this.id, undefined, true);
        }
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            cancel();
            throw new ProviderError(`HTTP ${response.status}: ${text}`, this.id, response.status, response.status >= 500 || response.status === 429);
        }
        if (!response.body) {
            cancel();
            throw new ProviderError('Empty response body', this.id);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let textOpen = false;
        let toolIndex = 0;
        try {
            for (;;) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                let nl;
                while ((nl = buffer.indexOf('\n')) >= 0) {
                    const raw = buffer.slice(0, nl);
                    buffer = buffer.slice(nl + 1);
                    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
                    if (!line.startsWith('data:'))
                        continue;
                    const payload = line.slice(5).trim();
                    if (!payload)
                        continue;
                    let chunk;
                    try {
                        chunk = JSON.parse(payload);
                    }
                    catch {
                        continue;
                    }
                    const candidate = chunk.candidates?.[0];
                    if (!candidate)
                        continue;
                    for (const part of candidate.content?.parts ?? []) {
                        if (part.text) {
                            if (!textOpen) {
                                yield { type: 'text_start' };
                                textOpen = true;
                            }
                            yield { type: 'text_delta', delta: part.text };
                        }
                        else if (part.functionCall) {
                            if (textOpen) {
                                yield { type: 'text_end' };
                                textOpen = false;
                            }
                            const id = `fc-${toolIndex++}`;
                            const name = part.functionCall.name;
                            yield { type: 'toolcall_start', id, name };
                            yield { type: 'toolcall_end', id, input: part.functionCall.args ?? {} };
                        }
                    }
                    if (chunk.usageMetadata) {
                        yield {
                            type: 'usage',
                            inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
                            outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
                            cachedTokens: chunk.usageMetadata.cachedContentTokenCount ?? 0,
                        };
                    }
                }
            }
            if (textOpen)
                yield { type: 'text_end' };
        }
        finally {
            cancel();
            try {
                reader.releaseLock();
            }
            catch { /* noop */ }
        }
    }
}
function makeTimeoutSignal(timeoutMs, external) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
    const onExternal = () => controller.abort(external.reason);
    if (external) {
        if (external.aborted)
            controller.abort(external.reason);
        else
            external.addEventListener('abort', onExternal, { once: true });
    }
    return {
        signal: controller.signal,
        cancel: () => {
            clearTimeout(timer);
            if (external)
                external.removeEventListener('abort', onExternal);
        },
    };
}
function buildGeminiBody(req, thinkingParam = null) {
    const contents = [];
    let systemInstruction;
    for (const msg of req.messages) {
        if (msg.role === 'system') {
            const text = typeof msg.content === 'string'
                ? msg.content
                : msg.content.filter((p) => p.type === 'text').map(p => p.text).join('');
            systemInstruction = { parts: [{ text }] };
            continue;
        }
        const parts = [];
        const raw = typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : msg.content;
        for (const p of raw) {
            if (p.type === 'text')
                parts.push({ text: p.text });
            else if (p.type === 'tool_result')
                parts.push({ text: p.content });
        }
        contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts });
    }
    const body = { contents };
    if (systemInstruction)
        body.systemInstruction = systemInstruction;
    if (req.tools && req.tools.length > 0) {
        body.tools = [{
                functionDeclarations: req.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.inputSchema ?? { type: 'object', properties: {} },
                })),
            }];
    }
    const generationConfig = {};
    if (req.temperature !== undefined)
        generationConfig.temperature = req.temperature;
    if (req.maxTokens !== undefined)
        generationConfig.maxOutputTokens = req.maxTokens;
    // Merge thinking config from catalogue if thinking is requested.
    if (thinkingParam?.generationConfig) {
        Object.assign(generationConfig, thinkingParam.generationConfig);
    }
    if (Object.keys(generationConfig).length > 0)
        body.generationConfig = generationConfig;
    return body;
}
//# sourceMappingURL=gemini.js.map