#!/usr/bin/env node
/**
 * CLI entry point.
 *
 * Default behaviour: when a prompt is provided on the command line, run
 * a single turn non-interactively and exit. When no prompt is provided
 * and stdin is a TTY, enter the interactive REPL. When stdin is piped,
 * read the prompt from stdin and run non-interactively.
 */

import { argv, cwd, exit, stdin, stdout } from "node:process";
import { randomUUID } from "node:crypto";
import { statSync, truncateSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createEventStream } from "../kernel/event-stream.js";
import { runAgentLoop } from "../kernel/agent-loop.js";
import type { Message } from "../kernel/types.js";
import { ProviderRegistry } from "../providers/index.js";
import {
  builtInTools,
  createToolExecutor,
  createToolRegistry,
} from "../tools/index.js";
import { loadConfig } from "./config.js";
import { parseFlags } from "./flags.js";
import { runInteractive } from "./interactive.js";
import { runInkTUI } from "../tui/ink/index.js";
import { builtinSlashCommands } from "./slash/index.js";
import { renderStreamingEvents } from "../tui/renderer.js";
import { createSessionStore } from "../context/session.js";
import { registerSession } from "../state/index.js";
import { runSubmitPaper } from "./submit-paper.js";
import {
  runLogin,
  runLogout,
  runSetup,
  findSubcommand,
} from "./subcommands/index.js";
import { appendAudit } from "../audit/writer.js";
import { buildAgentHooksFromConfig } from "../hooks/config-bridge.js";
import { hydrateEnvFromKeyStore } from "../auth/keystore.js";
import { hydrateEnvFromPool } from "../auth/keypool.js";
import { checkStartupUpdate } from "./update-check.js";
import { createExtensionAPI, loadExtensions } from "../extensions/api.js";
import { createErrorClassifier } from "../intelligence/error-classifier.js";
import { createCompactionTransform } from "../context/compaction.js";
import {
  contextWindowFor,
  findPrice,
  findFailover,
  resolveModelAlias,
} from "../intelligence/prices.js";
import { routeModel } from "../providers/dispatch.js";
import { loadProjectPrimer, composeSystemPrompt } from "../context/primer.js";
import { loadSoul } from "../context/soul.js";
import { ledgerScope, renderLedgerContext } from "../context/ledger.js";
import {
  modePreamble,
  resolveMode,
  isAutoApprove,
  type Mode,
} from "../context/mode.js";
import { enforceMode, composeHooks } from "../context/mode-enforcement.js";
import { loadSkills } from "../skills/loader.js";
import { matchSkills } from "../skills/matcher.js";
import { injectSkills } from "../skills/runtime.js";
import { createRequire } from "node:module";
import { checkFirstRun, showWelcomeWizard } from "./first-run.js";

// `--version` / `-V` prints the package version and exits, matching every
// other CLI on the planet. Without this, the flag-parser strips `--version`
// as a generic boolean and falls through to the interactive REPL.
const PKG_VERSION: string = (() => {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req("../../package.json") as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
})();

async function main(): Promise<void> {
  // First-run wizard: when the user runs `dirgha` with no arguments and
  // no provider API keys are configured at all, show the welcome wizard
  // and exit. Subcommands like `setup`, `keys set`, `login` still work
  // so users can configure things without the wizard blocking them.
  const rawArgs = argv.slice(2);
  const isBareInvocation =
    rawArgs.length === 0 ||
    rawArgs.every(
      (a) =>
        a.startsWith("-") &&
        a !== "--help" &&
        a !== "-h" &&
        a !== "--version" &&
        a !== "-V",
    );
  if (isBareInvocation && checkFirstRun()) {
    await showWelcomeWizard();
    exit(0);
  }

  const { flags, positionals } = parseFlags(argv.slice(2));
  // Top-level help/version only fire when there's no verb. With a verb
  // present (e.g. `dirgha fleet --help`), let the subcommand handle its
  // own help so users get scoped docs.
  if ((flags.help || flags.h) && positionals.length === 0) {
    printHelp();
    exit(0);
  }
  if (flags.version || flags.V) {
    stdout.write(`dirgha ${PKG_VERSION}\n`);
    exit(0);
  }

  // BYOK hydration: pool first (highest-priority non-exhausted entry
  // wins), then the legacy single-slot keystore for backwards compat.
  // Real env vars beat both, so a shell-exported override still wins.
  await hydrateEnvFromPool();
  await hydrateEnvFromKeyStore();

  // Fire-and-forget startup update check — doesn't block launch.
  checkStartupUpdate(PKG_VERSION).catch(() => {});

  // Load user extensions from ~/.dirgha/extensions/<name>/index.mjs.
  // Extensions register tools, slashes, subcommands, and event handlers.
  // Loading failures are non-fatal — the failing extension is named on
  // stderr and the rest of the CLI continues.
  const { api: extAPI, registry: extRegistry } = createExtensionAPI();
  const { join: pathJoin } = await import("node:path");
  const { homedir: hd } = await import("node:os");
  const extResult = await loadExtensions({
    rootDir: pathJoin(hd(), ".dirgha", "extensions"),
    api: extAPI,
  });
  for (const f of extResult.failed) {
    process.stderr.write(
      `[extensions] ${f.name} failed to load: ${f.error.message}\n`,
    );
  }
  void extRegistry; // surface for downstream wiring (slashes / tools / events)

  // Subcommand dispatch (positional 0 as verb).
  if (positionals[0] === "submit-paper") {
    const doi = positionals[1];
    if (!doi) {
      stdout.write("usage: dirgha submit-paper <doi> [--open-pr]\n");
      exit(1);
    }
    const code = await runSubmitPaper({
      doi,
      openPr: flags["open-pr"] === true,
    });
    exit(code);
  }
  // Pass the RAW argv tail (includes flags like `--provider=...`) so
  // sub-flags survive the top-level parser, the same pattern as fleet.
  if (positionals[0] === "login") {
    const verbIdx = rawArgs.indexOf("login");
    const tail =
      verbIdx >= 0 ? rawArgs.slice(verbIdx + 1) : positionals.slice(1);
    exit(await runLogin(tail));
  }
  if (positionals[0] === "logout") {
    const verbIdx = rawArgs.indexOf("logout");
    const tail =
      verbIdx >= 0 ? rawArgs.slice(verbIdx + 1) : positionals.slice(1);
    exit(await runLogout(tail));
  }
  if (positionals[0] === "setup") {
    const verbIdx = rawArgs.indexOf("setup");
    const tail =
      verbIdx >= 0 ? rawArgs.slice(verbIdx + 1) : positionals.slice(1);
    exit(await runSetup(tail));
  }
  if (positionals[0] === "fleet") {
    // `dirgha fleet <launch|list|merge|discard|triple|cleanup>` —
    // parallel-agent orchestration in git worktrees. We pass the
    // RAW argv tail (positionals + flags) so the fleet dispatcher
    // can read its own subcommand-specific flags like --single,
    // --branch=<x>, --auto-merge, --strategy that the top-level
    // parser doesn't know about.
    const { fleetCommand } = await import("../fleet/cli-command.js");
    const config = await loadConfig(cwd());
    const verbIdx = rawArgs.indexOf("fleet");
    const tail =
      verbIdx >= 0 ? rawArgs.slice(verbIdx + 1) : positionals.slice(1);
    const code = await fleetCommand(tail, {
      cwd: cwd(),
      model: resolveModelAlias(
        typeof flags.model === "string"
          ? flags.model
          : typeof flags.m === "string"
            ? flags.m
            : config.model,
      ),
      json: flags.json === true,
      verbose: flags.verbose === true,
      maxTurns:
        typeof flags["max-turns"] === "string"
          ? Number.parseInt(flags["max-turns"], 10)
          : config.maxTurns,
      concurrency:
        typeof flags.concurrency === "string"
          ? Number.parseInt(flags.concurrency, 10)
          : undefined,
    });
    exit(code);
  }

  // Generic subcommand dispatch. Covers: doctor, audit, stats, status,
  // init, keys, models, chat, ask, compact, export-session,
  // import-session (plus anything the auth agent adds to the barrel).
  //
  // We pass the raw argv tail (unparsed) so each subcommand can re-run
  // parseFlags with its own conventions. The tail starts after the
  // first occurrence of the verb in argv.
  {
    const verb = positionals[0];
    const cmd = verb ? findSubcommand(verb) : undefined;
    if (cmd) {
      const verbIdx = rawArgs.indexOf(verb);
      let tail =
        verbIdx >= 0 ? rawArgs.slice(verbIdx + 1) : positionals.slice(1);
      // Propagate top-level --mode=<value> into the subcommand's argv so
      // that `dirgha --mode=plan ask "prompt"` is equivalent to
      // `dirgha ask --mode=plan "prompt"`. Only inject when the subcommand
      // tail doesn't already contain its own --mode flag.
      const topLevelMode =
        typeof flags.mode === "string" ? flags.mode : undefined;
      if (topLevelMode && !tail.some((a) => a.startsWith("--mode"))) {
        tail = [`--mode=${topLevelMode}`, ...tail];
      }
      const code = await cmd.run(tail, { cwd: cwd() });
      // Telemetry — only sends when user opted in via `dirgha telemetry
      // enable`. We cap the wait at 1s so a slow Posthog response (cold
      // DNS, lossy link) never blocks the user. Opt-out users pay zero
      // latency: the sender returns immediately when config.enabled is
      // false. Events that don't land within 1s drop silently — the
      // sender's internal 8s budget keeps the request alive in case
      // Node's event loop survives long enough for it to flush.
      try {
        const { trackCommand } = await import("../telemetry/sender.js");
        await Promise.race([
          trackCommand(verb, PKG_VERSION),
          new Promise((r) => setTimeout(r, 1000)),
        ]);
      } catch {
        /* telemetry must never affect the user's command */
      }
      exit(code);
    }
  }

  const config = await loadConfig(cwd());
  // CLI-level overrides for flags that affect interactive mode too.
  // `--yolo` is the most surface-level form of "skip every approval",
  // more discoverable than `DIRGHA_MODE=yolo`.
  if (flags.yolo === true) config.mode = "yolo";
  if (
    typeof flags.mode === "string" &&
    (["plan", "act", "yolo", "verify", "ask"] as const).includes(
      flags.mode as Mode,
    )
  ) {
    config.mode = flags.mode as Mode;
  }
  const rawModel =
    typeof flags.model === "string"
      ? flags.model
      : typeof flags.m === "string"
        ? flags.m
        : config.model;
  const model = resolveModelAlias(rawModel);
  const json = flags.json === true;
  const print = flags.print === true;
  const system =
    typeof flags.system === "string"
      ? flags.system
      : typeof flags.s === "string"
        ? flags.s
        : undefined;
  const maxTurns =
    typeof flags["max-turns"] === "string"
      ? Number.parseInt(flags["max-turns"], 10)
      : config.maxTurns;

  const providers = new ProviderRegistry();
  const sessions = createSessionStore();

  // Load MCP servers from config and bridge their tools into the
  // registry. Failures spawning one server don't break the others;
  // they just surface as warnings on stderr. `mcp.shutdown()` runs at
  // process exit to terminate child processes cleanly.
  //
  // Persistent servers from ~/.dirgha/mcp.json are merged in first so
  // connections made via `/mcp connect` survive session restarts.
  // config.mcpServers (from ~/.dirgha/config.json or project config)
  // takes precedence over the persistent registry for the same name.
  const allTools = [...builtInTools];
  let mcpShutdown: () => Promise<void> = async () => {};
  {
    const { loadMcpConfig } = await import("../mcp/mcp-config.js");
    const persistedEntries = await loadMcpConfig();

    // Convert McpServerEntry → McpServerSpec shape.
    const persistedSpecs: Record<
      string,
      | { command: string; args?: string[]; env?: Record<string, string> }
      | { url: string; bearerToken?: string }
    > = {};
    for (const [n, entry] of Object.entries(persistedEntries)) {
      if (entry.type === "stdio" && entry.command) {
        persistedSpecs[n] = {
          command: entry.command,
          ...(entry.args !== undefined ? { args: entry.args } : {}),
          ...(entry.env !== undefined ? { env: entry.env } : {}),
        };
      } else if (entry.type === "http" && entry.url) {
        persistedSpecs[n] = {
          url: entry.url,
          ...(entry.bearerToken !== undefined
            ? { bearerToken: entry.bearerToken }
            : {}),
        };
      }
    }

    // Merge: persisted first, then config overrides for same name.
    const merged = {
      ...persistedSpecs,
      ...(config.mcpServers ?? {}),
    };

    if (Object.keys(merged).length > 0) {
      const { loadMcpServers } = await import("../mcp/loader.js");
      const mcp = await loadMcpServers(merged, {
        onWarn: (msg) => {
          process.stderr.write(`warning: ${msg}\n`);
        },
      });
      allTools.push(...mcp.tools);
      mcpShutdown = mcp.shutdown;
    }
  }
  const registry = createToolRegistry(allTools);
  process.once("exit", () => {
    void mcpShutdown();
  });
  process.once("SIGINT", () => {
    void mcpShutdown().then(() => process.exit(130));
  });

  // Subagent dispatch: register `task` so the model can spawn a fresh
  // agent for a sub-goal. Built lazily so the
  // delegator can capture the now-finalised registry + provider.
  const { SubagentDelegator } = await import("../subagents/delegator.js");
  const { createTaskTool } = await import("../tools/task.js");
  // Provider is constructed below; capture via closure so the tool sees
  // the same one. Re-pulled fresh inside execute() so failover swaps work.
  const taskDelegatorRef: {
    current: InstanceType<typeof SubagentDelegator> | null;
  } = { current: null };
  registry.register(
    createTaskTool({
      delegate: async (req) => {
        if (!taskDelegatorRef.current)
          throw new Error(
            "subagent delegator not initialised — the task tool requires an active provider session. " +
              "This should not happen in normal usage; if you see this, the CLI started before " +
              "the provider was resolved. Try restarting or submitting your first prompt first.",
          );
        return taskDelegatorRef.current.delegate(req);
      },
    } as InstanceType<typeof SubagentDelegator>),
  );

  let prompt = positionals.join(" ").trim();
  if (!prompt && !stdin.isTTY) prompt = (await readAllStdin()).trim();

  if (!prompt) {
    if (print || json) {
      printHelp();
      exit(1);
    }
    // First-run wizard: if the user has no BYOK keys saved AND no
    // hosted token, auto-launch the three-step setup flow. The wizard
    // itself prints CI-safe help when stdin is non-TTY.
    if (stdin.isTTY && (await isFirstRun())) {
      const { runWizard } = await import("./flows/wizard.js");
      const code = await runWizard([]);
      // If they completed setup, fall through into the REPL so they
      // can immediately use what they just configured. Otherwise exit.
      if (code !== 0) exit(code);
    }
    // Ink TUI is the default interactive renderer. Three escape hatches:
    //   1. DIRGHA_NO_INK=1                — explicit user opt-out (CI, tmp).
    //   2. Non-TTY stdin                  — piped input, can't drive ink.
    //   3. Windows legacy console (auto)  — cmd.exe / PowerShell-ISE
    //      drop Backspace + arrow keys via ink's raw-mode handling. We
    //      detect WT_SESSION (Windows Terminal), ConEmuANSI, or
    //      TERM_PROGRAM=vscode and only use ink when one is present.
    //      Override with DIRGHA_FORCE_INK=1 if the user knows their
    //      console actually works.
    const explicitNoInk = process.env["DIRGHA_NO_INK"] === "1";
    const explicitForceInk = process.env["DIRGHA_FORCE_INK"] === "1";
    const onWindowsLegacy =
      process.platform === "win32" &&
      !process.env["WT_SESSION"] &&
      process.env["ConEmuANSI"] !== "ON" &&
      process.env["TERM_PROGRAM"] !== "vscode";
    const autoFallbackToReadline = onWindowsLegacy && !explicitForceInk;
    const useInk = !explicitNoInk && !autoFallbackToReadline && stdin.isTTY;
    if (autoFallbackToReadline && !explicitNoInk) {
      // Surface the swap so the user knows why the UI looks different.
      stdout.write(
        "\x1b[33mNote:\x1b[0m Windows legacy console detected — using readline mode.\n" +
          "      For the full Ink TUI, run inside Windows Terminal, the VS Code terminal,\n" +
          "      or set \x1b[36mDIRGHA_FORCE_INK=1\x1b[0m to override.\n\n",
      );
    }
    if (useInk) {
      const slashCommands = builtinSlashCommands.map((c) => ({
        name: c.name,
        description: c.description,
        ...(c.aliases !== undefined ? { aliases: c.aliases } : {}),
      }));
      // Initialise the subagent delegator now that provider + registry are
      // ready. This must happen before runInkTUI() because the TUI path
      // returns early (line ~395) and never reaches the non-interactive
      // initialisation below, leaving taskDelegatorRef.current = null.
      taskDelegatorRef.current = new SubagentDelegator({
        registry,
        provider: providers.forModel(model),
        defaultModel: model,
        cwd: cwd(),
        parentSessionId: randomUUID(),
      });
      // Mount banner — on Windows the readline→ink raw-mode handoff
      // takes 1-2s during which nothing renders. Without this the user
      // sees a blank screen and assumes the app froze. The line is
      // overdrawn instantly when ink mounts.
      stdout.write("\n  Launching dirgha…\n");
      const inkLedgerCtx = await renderLedgerContext(ledgerScope("default"));
      await runInkTUI({
        registry,
        providers,
        sessions,
        config,
        cwd: cwd(),
        systemPrompt: system,
        slashCommands,
        ledgerContext: inkLedgerCtx || undefined,
      });
    } else {
      await runInteractive({
        registry,
        providers,
        sessions,
        config,
        cwd: cwd(),
        systemPrompt: system,
      });
    }
    return;
  }

  const sessionId = randomUUID();
  const events = createEventStream();
  if (json) {
    events.subscribe((ev) => {
      stdout.write(`${JSON.stringify(ev)}\n`);
    });
  } else {
    events.subscribe(
      renderStreamingEvents({ showThinking: config.showThinking }),
    );
  }

  // Persist the session: open the JSONL file up front so subsequent
  // `dirgha export-session` / `import-session` / `resume` work, and
  // so `dirgha stats` sees real message + token counts. Mirrors what
  // `runInteractive` already does for the readline path.
  const session = await sessions.create(sessionId);
  // Register in unified state index (fire-and-forget, never blocks).
  void registerSession(sessionId, model);
  const sessionTs = (): string => new Date().toISOString();
  // Compute USD cost from the price catalogue so persisted usage entries
  // and `dirgha stats` aren't always $0.00. Provider id is resolved from
  // the model id via the dispatch router (same routing the agent loop
  // uses, so the price lookup matches the actual provider).
  const providerId = routeModel(model);
  const price = findPrice(providerId, model);
  const computeCost = (
    input: number,
    output: number,
    cached: number,
  ): number =>
    price
      ? (input / 1_000_000) * price.inputPerM +
        (output / 1_000_000) * price.outputPerM +
        (cached / 1_000_000) * (price.cachedInputPerM ?? 0)
      : 0;
  events.subscribe(async (ev) => {
    try {
      if (ev.type === "usage") {
        const cached = ev.cachedTokens ?? 0;
        await session.append({
          type: "usage",
          ts: sessionTs(),
          usage: {
            inputTokens: ev.inputTokens,
            outputTokens: ev.outputTokens,
            cachedTokens: cached,
            costUsd: computeCost(ev.inputTokens, ev.outputTokens, cached),
          },
        });
      }
    } catch {
      /* never let persistence I/O break the run */
    }
  });
  // Audit writer: produce entries the `dirgha audit` reader can show.
  // Tool executions, errors, and end-of-turn are the high-signal ones.
  events.subscribe((ev) => {
    if (ev.type === "tool_exec_end") {
      void appendAudit({
        kind: "tool",
        actor: sessionId,
        summary: `${ev.id} ${ev.isError ? "error" : "done"} ${ev.durationMs}ms`,
        toolId: ev.id,
        isError: ev.isError,
        durationMs: ev.durationMs,
      });
    } else if (ev.type === "agent_end") {
      void appendAudit({
        kind: "turn-end",
        actor: sessionId,
        summary: `model=${model} stop=${ev.stopReason} in=${ev.usage.inputTokens} out=${ev.usage.outputTokens}`,
        model,
        stopReason: ev.stopReason,
        usage: ev.usage,
      });
    } else if (ev.type === "error") {
      void appendAudit({
        kind: "error",
        actor: sessionId,
        summary: ev.message,
      });
    }
  });

  const executor = createToolExecutor({ registry, cwd: cwd(), sessionId });
  const sanitized = registry.sanitize({ descriptionLimit: 200 });

  // Boot context: mode preamble + project primer (DIRGHA.md or
  // CLAUDE.md, capped at 8 KB) + caller's --system text. Without
  // this, the agent has zero project awareness — it's the parity
  // matrix's #1 gap to close.
  let mode = await resolveMode();
  // CLI-level overrides for one-off mode flips. `--yolo` is the most
  // surface-level form of "skip every approval", more discoverable
  // than `DIRGHA_MODE=yolo`.
  if (flags.yolo === true) mode = "yolo" as Mode;
  if (
    typeof flags.mode === "string" &&
    (["plan", "act", "yolo", "verify", "ask"] as const).includes(
      flags.mode as Mode,
    )
  ) {
    mode = flags.mode as Mode;
  }
  const autoApprove = isAutoApprove(mode);
  // Audit: record session start so `dirgha audit search <model>` /
  // `audit list` can surface every dirgha invocation, not just turns.
  // Lives after mode-resolve so we can include it in the entry.
  void appendAudit({
    kind: "session-start",
    actor: sessionId,
    summary: `model=${model} mode=${mode} cwd=${cwd()}`,
    model,
    mode,
    cwd: cwd(),
  });
  const primer = loadProjectPrimer(cwd());
  const soul = loadSoul();
  // Don't inject git_state in one-shot mode — small / fast models
  // can fixate on the workspace state and answer about it instead of
  // the user's prompt. Interactive sessions still inject it because
  // the conversation context anchors the model on the actual goal.
  const ledgerCtx = await renderLedgerContext(ledgerScope("default"));
  const composedSystem = composeSystemPrompt({
    soul: soul.text,
    modePreamble: modePreamble(mode),
    primer: primer.primer,
    ledgerContext: ledgerCtx,
    userSystem: system,
  });

  const messages: Message[] = [];
  messages.push({ role: "system", content: composedSystem });
  messages.push({ role: "user", content: prompt });

  // Append the user prompt before the turn so a crash mid-stream still
  // leaves a recoverable transcript prefix.
  await session.append({
    type: "message",
    ts: sessionTs(),
    message: { role: "user", content: prompt },
  });
  await session.append({
    type: "message",
    ts: sessionTs(),
    message: { role: "system", content: composedSystem },
  });

  // Skills: load all available; inject the ones whose triggers match
  // this turn's user prompt. Project-local skills override user skills
  // when names collide (loadSkills handles that). Skill bodies are
  // injected as a synthetic user message before the live prompt.
  const allSkills = await loadSkills({ cwd: cwd() });
  const matched = matchSkills(allSkills, {
    platform: "cli",
    userMessage: prompt,
  });

  // Provider construction can fail eagerly (e.g. ANTHROPIC_API_KEY
  // unset). When it does AND the user has a known failover model in
  // the registry, swap to that before we even reach the agent loop.
  // Same audit `failover` entry as runtime-error failover.
  let activeModel = model;
  let provider;
  try {
    provider = providers.forModel(model);
  } catch (err) {
    const fallback = findFailover(model);
    if (!fallback) throw err;
    process.stderr.write(
      `\n[failover] ${model} → ${fallback} (${err instanceof Error ? err.message : String(err)})\n`,
    );
    void appendAudit({
      kind: "failover",
      actor: sessionId,
      summary: `${model} → ${fallback}`,
      from: model,
      to: fallback,
      reason: err instanceof Error ? err.message : String(err),
    });
    activeModel = fallback;
    provider = providers.forModel(fallback);
  }
  // Now that provider + activeModel are settled, instantiate the
  // delegator that the `task` tool delegate-shim references.
  taskDelegatorRef.current = new SubagentDelegator({
    registry,
    provider,
    defaultModel: activeModel,
    cwd: cwd(),
    parentSessionId: sessionId,
  });
  // Context-aware compaction: at 75% of the model's context window we
  // summarise older history via the same provider and replace the
  // prefix with a synthetic user message. Keeps long sessions runnable
  // without 400-context-overflow errors.
  const baseCompactionTransform = createCompactionTransform({
    contextWindow: contextWindowFor(activeModel),
    summarizer: provider,
    summaryModel: activeModel,
    session,
    history: messages,
    onCompact: (r): void => {
      const before = r.tokensBefore.toLocaleString();
      const after = r.tokensAfter.toLocaleString();
      const pct = Math.round((1 - r.tokensAfter / r.tokensBefore) * 100);
      process.stderr.write(
        `\n[compacted] ${before} → ${after} tokens (-${pct}%)\n`,
      );
      void appendAudit({
        kind: "compaction",
        actor: sessionId,
        summary: `${before} → ${after} (-${pct}%)`,
        tokensBefore: r.tokensBefore,
        tokensAfter: r.tokensAfter,
      });
    },
  });
  // Compose: compact first, then inject skills before the live user
  // message. Skill content is per-turn — does not survive compaction.
  const compactionTransform =
    matched.length > 0
      ? async (msgs: Message[]): Promise<Message[]> =>
          injectSkills(await baseCompactionTransform(msgs), matched)
      : baseCompactionTransform;

  // Hooks: compose mode enforcement (plan/verify block writes) with
  // user-config hooks. Order matters — mode enforcement runs first so
  // a "shell command blocked by policy" stays clear in the audit log.
  const userHooks = buildAgentHooksFromConfig(config);
  const composedHooks = composeHooks(enforceMode(mode), userHooks);
  const errorClassifier = createErrorClassifier();
  const result = await runAgentLoop({
    sessionId,
    model: activeModel,
    messages,
    tools: sanitized.definitions,
    maxTurns,
    provider,
    toolExecutor: executor,
    events,
    contextTransform: compactionTransform,
    errorClassifier,
    autoApprove,
    costCalculator: computeCost,
    ...(composedHooks !== undefined ? { hooks: composedHooks } : {}),
  });
  // v1.15.0: no mid-session runtime failover — model switches during a
  // running session cause confusion and inconsistent results. If the
  // provider returns a transient error the agent loop surfaces it as a
  // normal error and the caller can retry with a different model on the
  // next invocation. Construction-time failover (missing API key) is
  // still active because it never reaches the loop.
  if (result.stopReason === "error") {
    process.stderr.write(
      `\n[failed] ${activeModel} (turn ${result.turnCount})\n`,
    );
  }
  // Persist every message produced by the turn (assistant turns + tool
  // results). Skip the user + system messages we already appended above.
  const initialCount = 2;
  for (const msg of result.messages.slice(initialCount)) {
    try {
      await session.append({ type: "message", ts: sessionTs(), message: msg });
    } catch {
      /* swallow */
    }
  }
  if (!json) stdout.write("\n");
  if (result.stopReason === "error") exit(2);
}

async function isFirstRun(): Promise<boolean> {
  const { stat } = await import("node:fs/promises");
  const { homedir: getHomedir } = await import("node:os");
  const { join: pathJoin } = await import("node:path");
  const home = getHomedir();
  const candidates = [
    pathJoin(home, ".dirgha", "keys.json"),
    pathJoin(home, ".dirgha", "credentials.json"),
    pathJoin(home, ".dirgha", "config.json"),
  ];
  for (const p of candidates) {
    const exists = await stat(p)
      .then(() => true)
      .catch(() => false);
    if (exists) return false;
  }
  return true;
}

function readAllStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    stdin.setEncoding("utf8");
    stdin.on("data", (c) =>
      chunks.push(typeof c === "string" ? c : (c as Buffer).toString("utf8")),
    );
    stdin.on("end", () => resolve(chunks.join("")));
  });
}

function printHelp(): void {
  stdout.write(`dirgha — coding agent CLI

Usage:
  dirgha                              Interactive REPL
  dirgha "prompt"                     One-shot non-interactive (equivalent to dirgha ask)
  echo prompt | dirgha --print        Stdin prompt → stdout answer
  dirgha --json "prompt"              NDJSON event stream

Subcommands:
  ask "<prompt>"                      Headless agent (tools, --max-turns 30 default)
  chat "<prompt>"                     Pure LLM call, no tools
  doctor [--json]                     Environment diagnostics
  status [--json]                     Account / model / providers / sessions
  stats [today|week|month|all]        Usage aggregates
  audit [list|tail|search <q>]        Local audit log
  init [path] [--force]               Scaffold DIRGHA.md
  keys <list|set|get|clear> ...       BYOK key store (~/.dirgha/keys.json)
  models <list|default|info> ...      Model catalogue + default
  memory <list|show|add|remove> ...   Long-term memory in ~/.dirgha/memory
  fleet <launch|list|merge|...> ...   Parallel agents in git worktrees
  verify "<goal>" --accept "<cmd>"    Run goal then gate on shell exit 0
  compact [sessionId]                 Force-compact a session on disk
  export-session <id> [path|-]        Dump session JSON
  import-session <path>               Load session JSON into the store
  login / logout / setup              Auth + first-run wizard
  update [--check] [--yes]            Check for + install latest @dirgha/code
  telemetry <status|enable|...>      Anonymous usage opt-in (default: OFF)
  submit-paper <doi>                  Fetch Crossref metadata, emit JSON
  scaffold "<prompt>" [--serve]      Spin up a new project from a prompt

Options:
  -m, --model <id>                    Model id (default from config)
  -t, --temperature <n>               Sampling temperature
  -s, --system <text>                 System prompt
      --max-turns <n>                 Max agent turns
      --print                         Non-interactive; text output
      --json                          NDJSON event output
  -h, --help                          This help

Environment:
  DIRGHA_MODEL, DIRGHA_MAX_TURNS, DIRGHA_SHOW_THINKING
  NVIDIA_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY,
  GEMINI_API_KEY / GOOGLE_API_KEY
`);
}

// Suppress EPIPE/EIO — these occur when the user closes the terminal or
// pipes output to `head`. Without these guards every PTY close logs a
// crash and exits non-zero.
process.stdout.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE" || e.code === "EIO") process.exit(0);
});
process.stderr.on("error", () => {});
process.stdin.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EIO" || e.code === "EPIPE") process.exit(0);
});
process.on("uncaughtException", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE" || e.code === "EIO") process.exit(0);
  throw e;
});

rotateCrashLog();

main().catch((err: unknown) => {
  stdout.write(
    `\nFatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  exit(2);
});

function rotateCrashLog(): void {
  const dir = join(homedir(), ".dirgha");
  const path = join(dir, "crash.log");
  try {
    if (!existsSync(path)) return;
    const info = statSync(path);
    // Rotate if > 10 MB or > 2000 lines (approximate)
    if (info.size < 10 * 1024 * 1024) return;
    const rotated = `${path}.old`;
    try {
      truncateSync(rotated, 0);
    } catch {
      /* */
    }
    // Keep last 200 entries
    const raw = require("node:fs").readFileSync(path, "utf8");
    const entries = raw.split("\n[").filter(Boolean);
    const kept = entries.slice(-200);
    const rebuilt =
      (kept[0]?.startsWith("[") ? kept[0] : `[${kept[0]}`) +
      kept
        .slice(1)
        .map((e: string) => `[${e}`)
        .join("");
    require("node:fs").writeFileSync(rotated, raw, "utf8");
    require("node:fs").writeFileSync(path, rebuilt, "utf8");
  } catch {
    /* best effort — crash log rotation is cosmetic */
  }
}
