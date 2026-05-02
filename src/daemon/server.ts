/**
 * Daemon server. Reads JSON-RPC messages from stdin, dispatches to
 * method handlers, writes responses + event notifications to stdout.
 * The stream id returned by prompt.submit correlates notifications for
 * the client.
 */

import { randomUUID } from "node:crypto";
import { stdin, stdout } from "node:process";
import type {
  DaemonRequest,
  DaemonResponse,
  EventNotification,
  HealthResult,
  PromptSubmitParams,
  PromptSubmitResult,
  SessionListResult,
  SessionMessagesResult,
  SessionResumeParams,
  SessionResumeResult,
  SessionStartParams,
  SessionStartResult,
} from "./protocol.js";
import type { Message, UsageTotal } from "../kernel/types.js";
import { createEventStream } from "../kernel/event-stream.js";
import { runAgentLoop } from "../kernel/agent-loop.js";
import type { ProviderRegistry } from "../providers/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import { createToolExecutor } from "../tools/exec.js";
import type { SessionStore, Session } from "../context/session.js";
import type { DirghaConfig } from "../cli/config.js";

interface ActiveSession {
  session: Session;
  history: Message[];
  usage: UsageTotal;
}

export interface DaemonServerOptions {
  registry: ToolRegistry;
  providers: ProviderRegistry;
  sessions: SessionStore;
  config: DirghaConfig;
  cwd: string;
}

type ServerState = "running" | "shuttingDown" | "exited";

export class DaemonServer {
  private active = new Map<string, ActiveSession>();
  private inFlight = new Set<Promise<void>>();
  private state: ServerState = "running";
  private abort = new AbortController();
  private started = Date.now();
  private totalUsage: UsageTotal = {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    costUsd: 0,
  };

  constructor(private opts: DaemonServerOptions) {}

  start(): void {
    let buffer = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const raw = JSON.parse(line) as DaemonRequest;
          void this.handle(raw);
        } catch (err) {
          this.writeError(null, -32700, `Parse error: ${String(err)}`);
        }
      }
    });
  }

  private async handle(req: DaemonRequest): Promise<void> {
    if (this.state !== "running" && req.method !== "daemon.shutdown") {
      this.writeError(req.id, -32000, "Server is shutting down");
      return;
    }

    try {
      switch (req.method) {
        case "daemon.health":
          this.writeResult(req.id, this.healthResult());
          return;
        case "daemon.shutdown":
          this.writeResult(req.id, { ok: true });
          await this.gracefulShutdown();
          return;
        case "session.start":
          this.writeResult(
            req.id,
            await this.sessionStart(
              req.params as SessionStartParams | undefined,
            ),
          );
          return;
        case "session.resume":
          this.writeResult(
            req.id,
            await this.sessionResume(req.params as SessionResumeParams),
          );
          return;
        case "session.list":
          this.writeResult(req.id, await this.sessionList());
          return;
        case "session.messages":
          this.writeResult(
            req.id,
            await this.sessionMessages(req.params as { sessionId: string }),
          );
          return;
        case "prompt.submit":
          this.writeResult(
            req.id,
            await this.promptSubmit(req.params as PromptSubmitParams),
          );
          return;
        default:
          this.writeError(req.id, -32601, `Method not found: ${req.method}`);
      }
    } catch (err) {
      this.writeError(
        req.id,
        -32000,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private async gracefulShutdown(): Promise<void> {
    if (this.state !== "running") return;
    this.state = "shuttingDown";

    // 1. Signal all in-flight agent loops to abort.
    this.abort.abort();

    // 2. Stop accepting new stdin.
    stdin.pause();

    // 3. Wait for in-flight agent loops to finish (with timeout).
    if (this.inFlight.size > 0) {
      const deadline = Date.now() + 10_000;
      const pending = [...this.inFlight];
      try {
        await Promise.race([
          Promise.allSettled(pending),
          new Promise<void>((r) => {
            const check = setInterval(() => {
              if (Date.now() > deadline) {
                clearInterval(check);
                r();
              }
            }, 100);
          }),
        ]);
      } catch {
        // Agent loops may reject after abort — expected.
      }
    }

    // 4. Sessions are stateless JSONL files — no close needed.
    // Clear the active map so GC can collect in-flight agent results.
    this.active.clear();

    this.state = "exited";
    process.exit(0);
  }

  private healthResult(): HealthResult {
    return {
      uptimeMs: Date.now() - this.started,
      sessionsActive: this.active.size,
      usage: this.totalUsage,
    };
  }

  private async sessionStart(
    params?: SessionStartParams,
  ): Promise<SessionStartResult> {
    const sessionId = randomUUID();
    const session = await this.opts.sessions.create(sessionId);
    const model = params?.model ?? this.opts.config.model;
    const history: Message[] = [];
    if (params?.system)
      history.push({ role: "system", content: params.system });
    this.active.set(sessionId, { session, history, usage: emptyUsage() });
    return { sessionId, model };
  }

  private async sessionResume(
    params: SessionResumeParams,
  ): Promise<SessionResumeResult> {
    const session = await this.opts.sessions.open(params.sessionId);
    if (!session) throw new Error(`Unknown session: ${params.sessionId}`);
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

  private async sessionList(): Promise<SessionListResult> {
    const ids = await this.opts.sessions.list();
    const out: SessionListResult["sessions"] = [];
    for (const id of ids) {
      const session = await this.opts.sessions.open(id);
      if (!session) continue;
      const messages = await session.messages();
      out.push({
        id,
        createdAt: "",
        turns: messages.filter((m) => m.role === "assistant").length,
      });
    }
    return { sessions: out };
  }

  private async sessionMessages(params: {
    sessionId: string;
  }): Promise<SessionMessagesResult> {
    const active = this.active.get(params.sessionId);
    if (active)
      return { sessionId: params.sessionId, messages: active.history };
    const session = await this.opts.sessions.open(params.sessionId);
    if (!session) throw new Error(`Unknown session: ${params.sessionId}`);
    return { sessionId: params.sessionId, messages: await session.messages() };
  }

  private async promptSubmit(
    params: PromptSubmitParams,
  ): Promise<PromptSubmitResult> {
    const active = this.active.get(params.sessionId);
    if (!active) throw new Error(`Unknown session: ${params.sessionId}`);
    const streamId = randomUUID();
    const events = createEventStream();
    events.subscribe((event) => {
      const notif: EventNotification = { streamId, event };
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

    const done = (async (): Promise<void> => {
      try {
        const result = await runAgentLoop({
          sessionId: params.sessionId,
          model: this.opts.config.model,
          messages: active.history,
          tools: sanitized.definitions,
          maxTurns: this.opts.config.maxTurns,
          provider,
          toolExecutor: executor,
          events,
          signal: this.abort.signal,
        });
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
      } catch (err) {
        if (this.abort.signal.aborted) return;
        this.writeNotification("event.stream", {
          streamId,
          event: {
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          },
        } as EventNotification);
      }
    })();
    const tracked = done;
    tracked.finally(() => {
      this.inFlight.delete(tracked);
    });
    this.inFlight.add(tracked);
    return { streamId };
  }

  private writeResult<T>(id: DaemonRequest["id"] | null, result: T): void {
    if (id === null) return;
    const out: DaemonResponse<T> = { jsonrpc: "2.0", id, result };
    stdout.write(`${JSON.stringify(out)}\n`);
  }

  private writeError(
    id: DaemonRequest["id"] | null,
    code: number,
    message: string,
  ): void {
    if (id === null) return;
    const out: DaemonResponse = {
      jsonrpc: "2.0",
      id,
      error: { code, message },
    };
    stdout.write(`${JSON.stringify(out)}\n`);
  }

  private writeNotification(method: string, params: unknown): void {
    stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }
}

function emptyUsage(): UsageTotal {
  return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 };
}
