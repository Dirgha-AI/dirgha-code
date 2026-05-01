/**
 * Daemon server. Reads JSON-RPC messages from stdin, dispatches to
 * method handlers, writes responses + event notifications to stdout.
 * The stream id returned by prompt.submit correlates notifications for
 * the client.
 */
import { randomUUID } from "node:crypto";
import { stdin, stdout } from "node:process";
import { createEventStream } from "../kernel/event-stream.js";
import { runAgentLoop } from "../kernel/agent-loop.js";
import { createToolExecutor } from "../tools/exec.js";
export class DaemonServer {
    opts;
    active = new Map();
    started = Date.now();
    totalUsage = {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        costUsd: 0,
    };
    constructor(opts) {
        this.opts = opts;
    }
    start() {
        let buffer = "";
        stdin.setEncoding("utf8");
        stdin.on("data", (chunk) => {
            buffer += chunk;
            let idx;
            while ((idx = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 1);
                if (!line.trim())
                    continue;
                try {
                    const raw = JSON.parse(line);
                    void this.handle(raw);
                }
                catch (err) {
                    this.writeError(null, -32700, `Parse error: ${String(err)}`);
                }
            }
        });
    }
    async handle(req) {
        try {
            switch (req.method) {
                case "daemon.health":
                    this.writeResult(req.id, this.healthResult());
                    return;
                case "daemon.shutdown":
                    this.writeResult(req.id, { ok: true });
                    process.exit(0);
                    return;
                case "session.start":
                    this.writeResult(req.id, await this.sessionStart(req.params));
                    return;
                case "session.resume":
                    this.writeResult(req.id, await this.sessionResume(req.params));
                    return;
                case "session.list":
                    this.writeResult(req.id, await this.sessionList());
                    return;
                case "session.messages":
                    this.writeResult(req.id, await this.sessionMessages(req.params));
                    return;
                case "prompt.submit":
                    this.writeResult(req.id, await this.promptSubmit(req.params));
                    return;
                default:
                    this.writeError(req.id, -32601, `Method not found: ${req.method}`);
            }
        }
        catch (err) {
            this.writeError(req.id, -32000, err instanceof Error ? err.message : String(err));
        }
    }
    healthResult() {
        return {
            uptimeMs: Date.now() - this.started,
            sessionsActive: this.active.size,
            usage: this.totalUsage,
        };
    }
    async sessionStart(params) {
        const sessionId = randomUUID();
        const session = await this.opts.sessions.create(sessionId);
        const model = params?.model ?? this.opts.config.model;
        const history = [];
        if (params?.system)
            history.push({ role: "system", content: params.system });
        this.active.set(sessionId, { session, history, usage: emptyUsage() });
        return { sessionId, model };
    }
    async sessionResume(params) {
        const session = await this.opts.sessions.open(params.sessionId);
        if (!session)
            throw new Error(`Unknown session: ${params.sessionId}`);
        const messages = await session.messages();
        this.active.set(params.sessionId, {
            session,
            history: messages,
            usage: emptyUsage(),
        });
        return {
            sessionId: params.sessionId,
            turns: messages.filter((m) => m.role === "assistant").length,
        };
    }
    async sessionList() {
        const ids = await this.opts.sessions.list();
        const out = [];
        for (const id of ids) {
            const session = await this.opts.sessions.open(id);
            if (!session)
                continue;
            const messages = await session.messages();
            out.push({
                id,
                createdAt: "",
                turns: messages.filter((m) => m.role === "assistant").length,
            });
        }
        return { sessions: out };
    }
    async sessionMessages(params) {
        const active = this.active.get(params.sessionId);
        if (active)
            return { sessionId: params.sessionId, messages: active.history };
        const session = await this.opts.sessions.open(params.sessionId);
        if (!session)
            throw new Error(`Unknown session: ${params.sessionId}`);
        return { sessionId: params.sessionId, messages: await session.messages() };
    }
    async promptSubmit(params) {
        const active = this.active.get(params.sessionId);
        if (!active)
            throw new Error(`Unknown session: ${params.sessionId}`);
        const streamId = randomUUID();
        const events = createEventStream();
        events.subscribe((event) => {
            const notif = { streamId, event };
            this.writeNotification("event.stream", notif);
            if (event.type === "usage") {
                active.usage.inputTokens += event.inputTokens;
                active.usage.outputTokens += event.outputTokens;
                this.totalUsage.inputTokens += event.inputTokens;
                this.totalUsage.outputTokens += event.outputTokens;
            }
        });
        active.history.push({ role: "user", content: params.prompt });
        await active.session.append({
            type: "message",
            ts: new Date().toISOString(),
            message: { role: "user", content: params.prompt },
        });
        const provider = this.opts.providers.forModel(this.opts.config.model);
        const executor = createToolExecutor({
            registry: this.opts.registry,
            cwd: this.opts.cwd,
            sessionId: params.sessionId,
        });
        const sanitized = this.opts.registry.sanitize({ descriptionLimit: 200 });
        void runAgentLoop({
            sessionId: params.sessionId,
            model: this.opts.config.model,
            messages: active.history,
            tools: sanitized.definitions,
            maxTurns: this.opts.config.maxTurns,
            provider,
            toolExecutor: executor,
            events,
        })
            .then(async (result) => {
            const savedCount = active.history.length;
            active.history.length = 0;
            active.history.push(...result.messages);
            for (const msg of result.messages.slice(savedCount)) {
                await active.session.append({
                    type: "message",
                    ts: new Date().toISOString(),
                    message: msg,
                });
            }
        })
            .catch((err) => {
            this.writeNotification("event.stream", {
                streamId,
                event: {
                    type: "error",
                    message: err instanceof Error ? err.message : String(err),
                },
            });
        });
        return { streamId };
    }
    writeResult(id, result) {
        if (id === null)
            return;
        const out = { jsonrpc: "2.0", id, result };
        stdout.write(`${JSON.stringify(out)}\n`);
    }
    writeError(id, code, message) {
        if (id === null)
            return;
        const out = {
            jsonrpc: "2.0",
            id,
            error: { code, message },
        };
        stdout.write(`${JSON.stringify(out)}\n`);
    }
    writeNotification(method, params) {
        stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    }
}
function emptyUsage() {
    return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 };
}
//# sourceMappingURL=server.js.map