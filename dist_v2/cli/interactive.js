/**
 * Interactive REPL. A thin readline loop that routes user input either
 * to the agent loop (regular prompts) or to the slash registry
 * (commands starting with /). Streaming output is rendered via the TUI
 * renderer subscribed to the shared event stream.
 */
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { createEventStream } from '../kernel/event-stream.js';
import { appendAudit } from '../audit/writer.js';
import { runAgentLoop } from '../kernel/agent-loop.js';
import { createToolExecutor } from '../tools/exec.js';
import { renderStreamingEvents } from '../tui/renderer.js';
import { getTheme, style } from '../tui/theme.js';
import { createTuiApprovalBus } from '../tui/approval.js';
import { maybeCompact } from '../context/compaction.js';
import { contextWindowFor, findPrice } from '../intelligence/prices.js';
import { routeModel } from '../providers/dispatch.js';
import { buildAgentHooksFromConfig } from '../hooks/config-bridge.js';
import { createDefaultSlashRegistry, registerBuiltinSlashCommands } from './slash.js';
import { loadToken, migrateLegacyAuth } from '../integrations/device-auth.js';
import { resolveMode } from '../context/mode.js';
import { loadProjectPrimer, composeSystemPrompt } from '../context/primer.js';
import { probeGitState, renderGitState } from '../context/git-state.js';
import { loadSoul } from '../context/soul.js';
import { modePreamble } from '../context/mode.js';
import { createErrorClassifier } from '../intelligence/error-classifier.js';
export async function runInteractive(opts) {
    const sessionId = randomUUID();
    const session = await opts.sessions.create(sessionId);
    const events = createEventStream();
    const slash = createDefaultSlashRegistry();
    await registerBuiltinSlashCommands(slash);
    const approvalBus = createTuiApprovalBus(new Set(opts.config.autoApproveTools));
    const render = renderStreamingEvents({ showThinking: opts.config.showThinking });
    events.subscribe(render);
    let currentModel = opts.config.model;
    // Audit writer: produces entries the `dirgha audit` reader can show.
    // Same shape as the one-shot path in cli/main.ts — kept inline so the
    // closure can read currentModel for accurate model attribution.
    events.subscribe(ev => {
        if (ev.type === 'tool_exec_end') {
            void appendAudit({ kind: 'tool', actor: sessionId, summary: `${ev.id} ${ev.isError ? 'error' : 'done'} ${ev.durationMs}ms`, toolId: ev.id, isError: ev.isError, durationMs: ev.durationMs });
        }
        else if (ev.type === 'agent_end') {
            void appendAudit({ kind: 'turn-end', actor: sessionId, summary: `model=${currentModel} stop=${ev.stopReason} in=${ev.usage.inputTokens} out=${ev.usage.outputTokens}`, model: currentModel, stopReason: ev.stopReason, usage: ev.usage });
        }
        else if (ev.type === 'error') {
            void appendAudit({ kind: 'error', actor: sessionId, summary: ev.message });
        }
    });
    let currentMode = await resolveMode();
    let currentThemeName = (opts.config.theme ?? 'dark');
    let currentTheme = getTheme(currentThemeName);
    const initial = [...(opts.initialMessages ?? [])];
    // System prompt is rebuilt per turn below so mode changes apply live.
    const history = [...initial];
    const totals = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 };
    // Cost lookup follows whichever model is current at usage-event time.
    // The provider id is resolved via the dispatch router so the price
    // table query matches the actual provider that served the call.
    events.subscribe(async (ev) => {
        if (ev.type === 'usage') {
            const cached = ev.cachedTokens ?? 0;
            const providerId = routeModel(currentModel);
            const price = findPrice(providerId, currentModel);
            const turnCost = price
                ? (ev.inputTokens / 1_000_000) * price.inputPerM + (ev.outputTokens / 1_000_000) * price.outputPerM + (cached / 1_000_000) * (price.cachedInputPerM ?? 0)
                : 0;
            totals.inputTokens += ev.inputTokens;
            totals.outputTokens += ev.outputTokens;
            totals.cachedTokens += cached;
            totals.costUsd += turnCost;
            try {
                await session.append({ type: 'usage', ts: new Date().toISOString(), usage: {
                        inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, cachedTokens: cached, costUsd: turnCost,
                    } });
            }
            catch { /* swallow */ }
        }
    });
    // Canonical auth lives in device-auth.ts. Migrate any legacy blob
    // synchronously-before-REPL-start, then prime the slash-command token.
    await migrateLegacyAuth().catch(() => undefined);
    let currentToken = await loadToken();
    process.stdout.write(style(currentTheme.accent, '\ndirgha-cli interactive mode.  /help for commands.\n\n'));
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        prompt: style(currentTheme.userPrompt, '❯ '),
    });
    rl.prompt();
    rl.on('line', line => { void handleLine(line); });
    rl.on('close', () => process.exit(0));
    const emitStatus = (message) => {
        process.stdout.write(style(currentTheme.muted, `\n${message}\n`));
        rl.prompt();
    };
    // Load the project primer once at boot. We walk up from cwd for
    // DIRGHA.md (or CLAUDE.md as compat). Cached for the session — if
    // the file changes mid-session, /clear or restart picks it up.
    const primerLoaded = loadProjectPrimer(opts.cwd);
    if (primerLoaded.source) {
        process.stdout.write(style(currentTheme.muted, `  primer: ${primerLoaded.source}${primerLoaded.truncated ? ' (truncated)' : ''}\n`));
    }
    const soulLoaded = loadSoul();
    /** Build the per-turn system prompt: soul + mode + primer + git_state + --system. */
    const buildSystem = () => {
        return composeSystemPrompt({
            soul: soulLoaded.text,
            modePreamble: modePreamble(currentMode),
            primer: primerLoaded.primer,
            gitState: renderGitState(probeGitState(opts.cwd)),
            userSystem: opts.systemPrompt,
        });
    };
    const handleLine = async (raw) => {
        const line = raw.trim();
        if (line.length === 0) {
            rl.prompt();
            return;
        }
        if (line.startsWith('/')) {
            const ctx = buildSlashCtx({
                session,
                opts,
                modelRef: { get model() { return currentModel; }, set model(v) { currentModel = v; } },
                totals,
                clearHistory: () => { history.length = 0; history.push(...initial); },
                exit: () => rl.close(),
                tokenRef: { get token() { return currentToken; }, set token(v) { currentToken = v; } },
                status: emitStatus,
                modeRef: { get mode() { return currentMode; }, set mode(v) { currentMode = v; } },
                themeRef: {
                    get name() { return currentThemeName; },
                    set name(v) {
                        currentThemeName = v;
                        currentTheme = getTheme(v);
                        rl.setPrompt(style(currentTheme.userPrompt, '❯ '));
                    },
                },
                providerForCurrent: () => opts.providers.forModel(currentModel),
                summaryModel: opts.config.summaryModel,
            });
            const result = await slash.dispatch(line, ctx);
            if (result.output)
                process.stdout.write(`${result.output}\n`);
            rl.prompt();
            return;
        }
        // Rebuild system prompt per turn so /mode changes apply immediately.
        const system = buildSystem();
        const turnHistory = system ? [{ role: 'system', content: system }, ...history] : [...history];
        turnHistory.push({ role: 'user', content: line });
        history.push({ role: 'user', content: line });
        await session.append({ type: 'message', ts: new Date().toISOString(), message: { role: 'user', content: line } });
        const executor = createToolExecutor({ registry: opts.registry, cwd: opts.cwd, sessionId });
        const sanitized = opts.registry.sanitize({ descriptionLimit: 200 });
        const provider = opts.providers.forModel(currentModel);
        const userHooks = buildAgentHooksFromConfig(opts.config);
        try {
            const result = await runAgentLoop({
                sessionId,
                model: currentModel,
                messages: turnHistory,
                tools: sanitized.definitions,
                maxTurns: opts.config.maxTurns,
                provider,
                toolExecutor: executor,
                approvalBus,
                events,
                errorClassifier: createErrorClassifier(),
                ...(userHooks !== undefined ? { hooks: userHooks } : {}),
                // Per-model compaction trigger: 75 % of the model's actual
                // context window beats a static 120k cap (which over-compacts
                // big-window models and under-compacts 32k ones).
                contextTransform: async (msgs) => (await maybeCompact(msgs, {
                    triggerTokens: Math.floor(contextWindowFor(currentModel) * 0.75),
                    preserveLastTurns: opts.config.compaction.preserveLastTurns,
                    summarizer: provider,
                    summaryModel: opts.config.summaryModel,
                }, session)).messages,
            });
            // Persist only the non-system portion so /mode changes don't
            // calcify a stale preamble into the history.
            history.length = 0;
            history.push(...result.messages.filter(m => m.role !== 'system'));
            for (const msg of result.messages.slice(-4)) {
                await session.append({ type: 'message', ts: new Date().toISOString(), message: msg });
            }
        }
        catch (err) {
            process.stdout.write(style(currentTheme.danger, `\n[fatal] ${err instanceof Error ? err.message : String(err)}\n`));
        }
        rl.prompt();
    };
}
function buildSlashCtx(a) {
    const apiBase = () => process.env['DIRGHA_API_BASE'] ?? process.env['DIRGHA_GATEWAY_URL'] ?? 'https://api.dirgha.ai';
    const upgradeUrl = () => process.env['DIRGHA_UPGRADE_URL'] ?? 'https://dirgha.ai/billing/upgrade';
    return {
        get model() { return a.modelRef.model; },
        get sessionId() { return a.session.id; },
        setModel(value) { a.modelRef.model = value; },
        showHelp() {
            return [
                'Slash commands:',
                '  /help              Show this message',
                '  /model [id]        Show or switch model',
                '  /mode [plan|act|verify]  Change execution mode',
                '  /theme [dark|light|none]  Change TUI theme',
                '  /compact           Manually compact history',
                '  /clear             Clear transcript (keeps session on disk)',
                '  /session list      List saved sessions',
                '  /session load <id> Load a session',
                '  /session branch <name>  Branch current session with a summary',
                '  /skills            List skills available for this turn',
                '  /cost              Show cumulative usage',
                '  /login             Sign in via device-code flow',
                '  /account           Show billing tier, balance, limits',
                '  /upgrade           Upgrade to a paid tier',
                '  /exit, /quit       Exit',
            ].join('\n');
        },
        async compact() {
            return '(compact runs automatically each turn; use /cost to inspect usage.)';
        },
        clear() {
            a.clearHistory();
            process.stdout.write(style(a.themeRef.name === 'none' ? '' : '\x1b[32m', '(transcript cleared)\n'));
        },
        async listSessions() {
            const ids = await a.opts.sessions.list();
            return ids.length === 0 ? '(no saved sessions)' : ids.map(id => `- ${id}`).join('\n');
        },
        async loadSession(id) {
            const next = await a.opts.sessions.open(id);
            if (!next)
                return `Session ${id} not found.`;
            return `Loaded ${id}. Previous messages: ${(await next.messages()).length}.`;
        },
        async listSkills() {
            return '(skills system is wired; run `dirgha skills` for full detail.)';
        },
        showCost() {
            return `tokens in=${a.totals.inputTokens} out=${a.totals.outputTokens} cached=${a.totals.cachedTokens} cost=$${a.totals.costUsd.toFixed(4)}`;
        },
        exit(code = 0) { a.exit(); process.exit(code); },
        getToken() { return a.tokenRef.token; },
        setToken(value) { a.tokenRef.token = value; },
        apiBase,
        upgradeUrl,
        status: a.status,
        getMode() { return a.modeRef.mode; },
        setMode(value) { a.modeRef.mode = value; },
        getTheme() { return a.themeRef.name; },
        setTheme(value) { a.themeRef.name = value; },
        getSession() { return a.session; },
        getSessionStore() { return a.opts.sessions; },
        getProvider() { return a.providerForCurrent(); },
        getSummaryModel() { return a.summaryModel; },
    };
}
//# sourceMappingURL=interactive.js.map