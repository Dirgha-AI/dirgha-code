/**
 * ACP (Agent Client Protocol) adapter.
 *
 * Thin bridge between the ACP wire format and the daemon protocol. ACP
 * lets IDEs embed dirgha as their agent backend with a reduced, stable
 * method surface. Implements the minimum viable methods: initialize,
 * newSession, prompt, and cancel. Runs over stdio JSON-RPC.
 */
import { randomUUID } from 'node:crypto';
import { stdin, stdout } from 'node:process';
import { createEventStream } from '../kernel/event-stream.js';
import { runAgentLoop } from '../kernel/agent-loop.js';
import { extractText } from '../kernel/message.js';
import { createToolExecutor } from '../tools/exec.js';
export class AcpServer {
    opts;
    sessionsByAcpId = new Map();
    usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 };
    constructor(opts) {
        this.opts = opts;
    }
    start() {
        let buffer = '';
        stdin.setEncoding('utf8');
        stdin.on('data', chunk => {
            buffer += chunk;
            let idx;
            while ((idx = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 1);
                if (!line.trim())
                    continue;
                try {
                    void this.handle(JSON.parse(line));
                }
                catch { /* skip */ }
            }
        });
    }
    async handle(req) {
        try {
            switch (req.method) {
                case 'initialize':
                    this.reply(req.id, {
                        protocolVersion: 1,
                        agentCapabilities: { streaming: true, tools: true },
                        authMethods: [],
                    });
                    return;
                case 'session/new': {
                    const acpSessionId = randomUUID();
                    const storeSession = await this.opts.sessions.create(acpSessionId);
                    this.sessionsByAcpId.set(acpSessionId, { sessionId: storeSession.id, history: [] });
                    this.reply(req.id, { sessionId: acpSessionId });
                    return;
                }
                case 'session/prompt':
                    await this.handlePrompt(req);
                    return;
                case 'session/cancel':
                    this.reply(req.id, { ok: true });
                    return;
                default:
                    this.replyError(req.id, -32601, `Method not found: ${req.method}`);
            }
        }
        catch (err) {
            this.replyError(req.id, -32000, err instanceof Error ? err.message : String(err));
        }
    }
    async handlePrompt(req) {
        const params = req.params ?? {};
        const acpSessionId = params.sessionId;
        const promptBlocks = params.prompt ?? [];
        const prompt = promptBlocks.map(b => b.text ?? '').join('');
        const active = this.sessionsByAcpId.get(acpSessionId);
        if (!active) {
            this.replyError(req.id, -32602, `Unknown session: ${acpSessionId}`);
            return;
        }
        active.history.push({ role: 'user', content: prompt });
        const events = createEventStream();
        events.subscribe(event => {
            if (event.type === 'text_delta') {
                this.notify('session/update', {
                    sessionId: acpSessionId,
                    update: { kind: 'agent_message_chunk', content: { type: 'text', text: event.delta } },
                });
            }
            else if (event.type === 'usage') {
                this.usage.inputTokens += event.inputTokens;
                this.usage.outputTokens += event.outputTokens;
            }
        });
        const provider = this.opts.providers.forModel(this.opts.config.model);
        const executor = createToolExecutor({
            registry: this.opts.registry,
            cwd: this.opts.cwd,
            sessionId: active.sessionId,
        });
        const sanitized = this.opts.registry.sanitize({ descriptionLimit: 200 });
        try {
            const result = await runAgentLoop({
                sessionId: active.sessionId,
                model: this.opts.config.model,
                messages: active.history,
                tools: sanitized.definitions,
                maxTurns: this.opts.config.maxTurns,
                provider,
                toolExecutor: executor,
                events,
            });
            active.history.length = 0;
            active.history.push(...result.messages);
            const lastAssistant = [...result.messages].reverse().find(m => m.role === 'assistant');
            this.reply(req.id, {
                stopReason: result.stopReason,
                lastMessage: lastAssistant ? extractText(lastAssistant) : '',
            });
        }
        catch (err) {
            this.replyError(req.id, -32000, err instanceof Error ? err.message : String(err));
        }
    }
    reply(id, result) {
        const out = { jsonrpc: '2.0', id, result };
        stdout.write(`${JSON.stringify(out)}\n`);
    }
    replyError(id, code, message) {
        const out = { jsonrpc: '2.0', id, error: { code, message } };
        stdout.write(`${JSON.stringify(out)}\n`);
    }
    notify(method, params) {
        stdout.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    }
}
//# sourceMappingURL=server.js.map