import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Ink root component for the dirgha TUI.
 *
 * Layout is a single vertical stack:
 *   1. Logo (emitted to stdout once before Ink mounts — see ./index.ts)
 *   2. Transcript (finalised user messages + completed turn blocks)
 *   3. LiveTurn (the currently streaming turn, if any)
 *   4. InputBox
 *   5. StatusBar
 *   6. Optional overlay (ModelPicker / HelpOverlay / AtFileComplete)
 *
 * Event → transcript projection lives in `use-event-projection.ts`;
 * overlay state lives in `use-overlays.ts`. This component stays
 * focused on layout and lifecycle.
 */
import * as React from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { randomUUID } from "node:crypto";
import { Static } from "ink";
import { appendAudit } from "../../audit/writer.js";
import { maybeCompact } from "../../context/compaction.js";
import { contextWindowFor, resolveModelAlias } from "../../intelligence/prices.js";
import { buildAgentHooksFromConfig } from "../../hooks/config-bridge.js";
import { enforceMode, composeHooks } from "../../context/mode-enforcement.js";
import { loadProjectPrimer, composeSystemPrompt, } from "../../context/primer.js";
import { queryKb } from "../../context/kb-query.js";
import { probeGitState, renderGitState } from "../../context/git-state.js";
import { loadSoul } from "../../context/soul.js";
import { routeModel } from "../../providers/dispatch.js";
import { isAutoApprove, modePreamble } from "../../context/mode.js";
import { runAgentLoop } from "../../kernel/agent-loop.js";
import { createErrorClassifier } from "../../intelligence/error-classifier.js";
import { LoopDetector } from "../../subagents/loop-detector.js";
import { createToolExecutor } from "../../tools/exec.js";
import { createInkApprovalBus, } from "./ink-approval-bus.js";
import { ApprovalPrompt, } from "./components/ApprovalPrompt.js";
import { PRICES } from "../../intelligence/prices.js";
import { StatusBar } from "./components/StatusBar.js";
import { StreamingText } from "./components/StreamingText.js";
import { ThinkingBlock, ThinkingBlockGroup, } from "./components/ThinkingBlock.js";
import { ToolBox } from "./components/ToolBox.js";
import { ToolGroup } from "./components/ToolGroup.js";
import { InputBox } from "./components/InputBox.js";
import { PromptQueueIndicator } from "./components/PromptQueueIndicator.js";
// TaskIndicator removed from persistent UI — stale cross-session tasks cluttered bootup
import { SubagentPanel } from "./components/SubagentPanel.js";
import { GPUJobIndicator } from "./components/GPUJobIndicator.js";
import { ModelPicker } from "./components/ModelPicker.js";
import { ModelSwitchPrompt } from "./components/ModelSwitchPrompt.js";
import { ProviderPicker, } from "./components/ProviderPicker.js";
import { OpenRouterCompanyPicker, } from "./components/OpenRouterCompanyPicker.js";
import { HelpOverlay, } from "./components/HelpOverlay.js";
import { KeySetOverlay } from "./components/KeySetOverlay.js";
import { saveKey } from "../../auth/keystore.js";
import { loadToken, migrateLegacyAuth, } from "../../integrations/device-auth.js";
import { getUpdateBannerVersion } from "../../cli/update-check.js";
import { AtFileComplete } from "./components/AtFileComplete.js";
import { SlashComplete } from "./components/SlashComplete.js";
import { ThemePicker } from "./components/ThemePicker.js";
import { SandboxPicker } from "./components/SandboxPicker.js";
import { ThemeProvider, useTheme } from "./theme-context.js";
import { SpinnerContext } from "./spinner-context.js";
import { SpinnerGlyph } from "./components/SpinnerGlyph.js";
import { statusbarTickMs, minFlushMs } from "./is-small-terminal.js";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join as pathJoin } from "node:path";
import { useEventProjection, } from "./use-event-projection.js";
import { useOverlays } from "./use-overlays.js";
import { useToolProgress } from "./use-tool-progress.js";
import { useDeclinedVersions } from "./use-declined-versions.js";
import { useStartupHealth } from "./use-startup-health.js";
import { useFlickerDetector } from "./use-flicker-detector.js";
import { useRenderMetrics, } from "./use-render-metrics.js";
import { getRemoteConfig, isVersionBelowMin, } from "../../intelligence/remote-config.js";
import { createRequire } from "node:module";
// Pulled from the installed package.json so the TUI title matches the
// shipped binary version. Falls back to '0.0.0-dev' if the file isn't
// reachable (e.g. an unusual deploy layout).
export const VERSION = (() => {
    try {
        const req = createRequire(import.meta.url);
        const pkg = req("../../../package.json");
        return typeof pkg.version === "string" ? pkg.version : "0.0.0-dev";
    }
    catch {
        return "0.0.0-dev";
    }
})();
// Cache for initialHistory — avoids sync fs I/O in the render phase
// on re-calls (e.g. /clear). The underlying files rarely change within
// a session so a single snapshot is sufficient.
let _cachedInitialMessages = null;
export function App(props) {
    const { exit } = useApp();
    const sessionIdRef = React.useRef(randomUUID());
    const historyRef = React.useRef(initialHistory(props));
    const abortRef = React.useRef(null);
    // Stores the user-facing cancellation message so the finally block can
    // inject it via appendLiveSync (avoids the React state-updater race
    // where appendLive doesn't update liveItemsRef before commitLive reads it).
    const interruptMsgRef = React.useRef(null);
    const pendingModelRef = React.useRef(null);
    const sessionRef = React.useRef(null);
    const loopDetectorRef = React.useRef(new LoopDetector());
    // Tracks whether the model has produced its first response in this
    // session. The system prompt includes a one-line `[session-title]`
    // instruction only on the first turn; after the first agent_end the
    // instruction is stripped out so it does not appear on every turn.
    const firstTurnRef = React.useRef(!(props.initialMessages ?? []).some((m) => m.role === "user" || m.role === "assistant"));
    // Live sandbox mode — initialised from config, mutated by /sandbox.
    // Read by the executor wiring on every tool dispatch so the toggle
    // takes effect on the next tool call without re-mounting the App.
    const sandboxModeRef = React.useRef(props.config.sandbox ?? "off");
    React.useEffect(() => {
        const id = sessionIdRef.current;
        void props.sessions.create(id).then((s) => {
            sessionRef.current = s;
            if (props.sessionHandle)
                props.sessionHandle.session = s;
        });
        return () => {
            if (sessionRef.current) {
                try {
                    sessionRef.current.close();
                }
                catch {
                    /* swallow */
                }
                if (props.sessionHandle)
                    props.sessionHandle.session = null;
            }
        };
    }, [props.sessions, props.sessionHandle]);
    const [transcript, setTranscript] = React.useState([]);
    const [input, setInput] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [thinkingStreaming, setThinkingStreaming] = React.useState(false);
    // Prompt queue: while a turn is streaming the user can still type and
    // press Enter. Submissions land here instead of being dropped, then
    // drain FIFO when the turn finishes (see useEffect below).
    const [promptQueue, setPromptQueue] = React.useState([]);
    // Mirror promptQueue in a ref so callbacks can read the latest value
    // without capturing stale closures and without causing dependency cycles.
    const promptQueueRef = React.useRef([]);
    promptQueueRef.current = promptQueue;
    const activeTools = useToolProgress(props.events);
    const [currentModel, setCurrentModel] = React.useState(props.config.model);
    // Inline key entry: set when a provider throws "X_API_KEY is required"
    // (either at model-pick time or when a turn fires). Cleared on save/cancel.
    const [pendingKey, setPendingKey] = React.useState(null);
    // Multi-step picker stage. Stage 1 = ProviderPicker (default when
    // overlays.active === 'models'); stage 2 = ModelPicker filtered to
    // the picked provider. Resets to 'provider' on every fresh open.
    const [pickerStage, setPickerStage] = React.useState("provider");
    const [pickerProvider, setPickerProvider] = React.useState(null);
    // For OpenRouter 3-step flow: upstream company prefix (e.g. "deepseek", "google")
    const [pickerOrCompany, setPickerOrCompany] = React.useState(null);
    // Pending model-switch prompt — set when the kernel emits an error
    // with a `failoverModel` hint. Cleared when the user answers
    // [y|n|p]. While set, an inline ModelSwitchPrompt renders below
    // the input box; submitting any other prompt also clears it.
    const [pendingFailover, setPendingFailover] = React.useState(null);
    const lastUserPromptRef = React.useRef("");
    const [promptHistory, setPromptHistory] = React.useState([]);
    // Dirgha Gateway token loaded from ~/.dirgha/credentials.json.
    // Required for billing, entitlements, deploy, and /account.
    const tokenRef = React.useRef(null);
    React.useEffect(() => {
        migrateLegacyAuth()
            .then(() => loadToken())
            .then((t) => {
            if (t)
                tokenRef.current = t;
        })
            .catch(() => { });
    }, []);
    // Approval bus — single instance per App so subscriptions persist across
    // turns. Replaces the legacy `createTuiApprovalBus` that wrote prompts
    // direct to stdout (overdrawn by Ink) and read stdin raw (hung on
    // Windows). See `ink-approval-bus.ts` for the full rationale.
    const approvalBusRef = React.useRef(null);
    if (!approvalBusRef.current) {
        const autoApproveSet = new Set(props.config.autoApproveTools);
        autoApproveSet.add("rtk"); // RTK is a safe shell wrapper, never needs approval
        approvalBusRef.current = createInkApprovalBus(autoApproveSet);
    }
    const [pendingApproval, setPendingApproval] = React.useState(null);
    React.useEffect(() => {
        const bus = approvalBusRef.current;
        if (!bus)
            return;
        return bus.subscribe((req) => setPendingApproval(req));
    }, []);
    // Mode state: SlashContext.setMode flips it live so /mode plan|act|verify|ask
    // takes effect on the next turn (system-prompt rebuild downstream picks it up).
    const [mode, setMode] = React.useState(props.config.mode ?? "act");
    // Adaptive backpressure ref: declared here (before useEventProjection) so
    // the projection can read it from the first render. Updated by the effect
    // below that watches render frame times from useRenderMetrics().
    const adaptiveFlushRef = React.useRef({ floorMs: minFlushMs() });
    const frameEmaRef = React.useRef(minFlushMs());
    const projection = useEventProjection(props.events, {
        // Gemini CLI parity: when streamed text exceeds 5000 chars, split it
        // at a safe markdown boundary and push the older portion to committed
        // history (in <Static>), keeping the trailing chunk dynamic.
        onCommitSplit: React.useCallback((item) => {
            setTranscript((prev) => [...prev, item]);
        }, []),
        adaptiveFlushRef,
        // First-turn `[session-title] X` marker support. The projection
        // strips the marker line from the transcript; here we surface the
        // captured title as: (a) the OSC 0 terminal title, (b) a persisted
        // session entry, (c) React state for any future `/sessions` UI.
        isFirstTurn: React.useCallback(() => firstTurnRef.current, []),
        onSessionTitle: React.useCallback((title) => {
            // Strip control characters from LLM-supplied title before
            // injecting into an OSC sequence — a raw 0x07/0x9c would close
            // the OSC string early and let the model inject arbitrary
            // terminal codes. Codepoint filter avoids eslint's
            // `no-control-regex` rule (which fires on both literal and
            // string-constructed regexes).
            const safe = Array.from(title)
                .filter((c) => {
                const cp = c.charCodeAt(0);
                return cp >= 0x20 && cp !== 0x7f;
            })
                .join("")
                .slice(0, 80)
                .trim();
            if (!safe)
                return;
            sessionTitleRef.current = safe;
            try {
                if (process.stdout.isTTY) {
                    process.stdout.write(`\x1b]0;Dirgha · ${safe}\x07`);
                }
            }
            catch {
                /* OSC write best-effort */
            }
            const s = sessionRef.current;
            if (s) {
                void s
                    .append({
                    type: "title",
                    ts: new Date().toISOString(),
                    title: safe,
                })
                    .catch(() => {
                    /* persistence best-effort — non-blocking */
                });
                // Also update the state index so the session listing shows the title.
                const id = s.id;
                if (id) {
                    import("../../state/index.js").then(({ renameSession }) => renameSession(id, safe).catch(() => { }));
                }
            }
        }, []),
    });
    // Holds the most recent session title (set by the projection's
    // `onSessionTitle` callback). Read by future surfaces (/sessions
    // list, status bar, etc) — not currently displayed in v1.20.40.
    const sessionTitleRef = React.useRef(null);
    const overlays = useOverlays();
    // Live counters for the in-progress turn — drive the StatusBar
    // tok/s readout. Reset at agent_start, accumulate output deltas,
    // refresh tick at 250 ms so the rate updates visibly.
    const [liveOutputTokens, setLiveOutputTokens] = React.useState(0);
    const [liveDurationMs, setLiveDurationMs] = React.useState(0);
    const turnStartRef = React.useRef(0);
    const liveOutputTokensAccRef = React.useRef(0);
    const [updateVersion, setUpdateVersion] = React.useState(null);
    const updateShownRef = React.useRef(false);
    const declined = useDeclinedVersions();
    React.useEffect(() => {
        if (updateShownRef.current)
            return;
        updateShownRef.current = true;
        getUpdateBannerVersion(VERSION).then((v) => {
            if (v && !declined.isDeclined(v))
                setUpdateVersion(v);
        });
    }, [declined]);
    // Startup health check — non-blocking, cached for 24h.
    const healthResult = useStartupHealth();
    // Flicker detector — compares estimated tree height to terminal rows.
    const estimatedLineCount = (transcript.length + projection.liveItems.length) * 2 + 15;
    const flicker = useFlickerDetector(estimatedLineCount);
    // When the live viewport overflows the terminal, cap the number of live
    // items rendered per frame. This prevents Ink from repainting the full
    // scrollback on every streaming tick, which is the root cause of flicker.
    // Reuse the stdout already obtained by useFlickerDetector — a second
    // useStdout() call would register a duplicate resize listener.
    const { stdout: _flickerStdout } = useStdout();
    const _termRows = _flickerStdout?.rows ?? 24;
    const _maxLiveItems = flicker.overflowDetected
        ? Math.max(4, Math.floor((_termRows - 6) / 1.5))
        : Infinity;
    // Preserve array identity when no truncation needed — avoids spurious
    // useMemo recalculation on every render when overflow is not active.
    const _liveItemCount = projection.liveItems.length;
    const _overflowCount = flicker.overflowDetected && _maxLiveItems < _liveItemCount
        ? _liveItemCount - _maxLiveItems
        : 0;
    const _visibleLiveItems = _overflowCount > 0
        ? projection.liveItems.slice(-_maxLiveItems)
        : projection.liveItems;
    // Render performance metrics — track frame timing, expose for StatusBar.
    const renderMetrics = useRenderMetrics();
    const [showRenderMetrics, setShowRenderMetrics] = React.useState(false);
    // Update adaptiveFlushRef on every render based on observed frame times.
    // EMA (alpha=0.3) smooths out single-frame spikes to avoid thrashing.
    // When frames are slow (> minFlushMs * 1.5): raise floor toward lastFrameMs * 1.2.
    // When frames recovered (< minFlushMs * 0.8): decay floor back toward minFlushMs.
    // Guarded on `busy || isStreaming` so keystroke renders (very fast, ~5ms) do NOT
    // pollute the EMA and cause the flush floor to oscillate — without this guard
    // every keystroke pulled the EMA down, then the next streaming flush pulled it
    // back up, producing inconsistent flush timing → visible jitter/flicker.
    React.useEffect(() => {
        if (!busy && projection.liveItems.length === 0)
            return;
        const lastMs = renderMetrics.lastFrameTimeMs();
        if (lastMs <= 0)
            return;
        frameEmaRef.current = 0.3 * lastMs + 0.7 * frameEmaRef.current;
        const ema = frameEmaRef.current;
        const floor = minFlushMs();
        if (ema > floor * 1.5) {
            adaptiveFlushRef.current.floorMs = Math.min(ema * 1.2, 500);
        }
        else if (ema < floor * 0.8) {
            const current = adaptiveFlushRef.current.floorMs;
            adaptiveFlushRef.current.floorMs = Math.max(floor, current - (current - floor) * 0.1);
        }
    });
    // Alt+M toggles the render-metrics display in the StatusBar.
    useInput((ch, key) => {
        if (key.meta && ch === "m") {
            setShowRenderMetrics((v) => !v);
        }
    });
    // Remote config: fetch once on mount, set model default, show MOTD.
    const [remoteConfig, setRemoteConfig] = React.useState(null);
    const [motdShown, setMotdShown] = React.useState(false);
    const [remoteConfigFetched, setRemoteConfigFetched] = React.useState(false);
    React.useEffect(() => {
        if (remoteConfigFetched)
            return;
        setRemoteConfigFetched(true);
        void getRemoteConfig().then((cfg) => {
            if (cfg)
                setRemoteConfig(cfg);
        });
    }, [remoteConfigFetched]);
    // Apply remote config model default on first load if no explicit model set.
    const remoteModelAppliedRef = React.useRef(false);
    React.useEffect(() => {
        if (!remoteConfig || remoteModelAppliedRef.current)
            return;
        remoteModelAppliedRef.current = true;
        const explicit = props.config.model;
        const hasDefault = explicit !== undefined &&
            explicit !== "" &&
            explicit !== "accounts/fireworks/routers/kimi-k2p5-turbo";
        if (!hasDefault && remoteConfig.recommendedModel) {
            setCurrentModel(remoteConfig.recommendedModel);
        }
    }, [remoteConfig, props.config.model]);
    // Show MOTD once per session.
    React.useEffect(() => {
        if (!remoteConfig?.motd || motdShown)
            return;
        setMotdShown(true);
        const note = {
            kind: "notice",
            id: randomUUID(),
            text: remoteConfig.motd,
        };
        setTranscript((prev) => [...prev, note]);
    }, [remoteConfig, motdShown]);
    // Warn about deprecated models if the current model is in the list.
    const deprecatedWarnedRef = React.useRef(false);
    React.useEffect(() => {
        if (!remoteConfig || deprecatedWarnedRef.current)
            return;
        if (remoteConfig.deprecatedModels.length > 0 &&
            remoteConfig.deprecatedModels.includes(currentModel)) {
            deprecatedWarnedRef.current = true;
            const note = {
                kind: "notice",
                id: randomUUID(),
                text: `[DEPRECATED] Model ${currentModel} is deprecated. Switch to ${remoteConfig.recommendedModel ?? "a supported model"} via /model.`,
            };
            setTranscript((prev) => [...prev, note]);
        }
    }, [remoteConfig, currentModel]);
    // Minimum version nag: show upgrade banner immediately if below minimum.
    const [minVersionNagShown, setMinVersionNagShown] = React.useState(false);
    React.useEffect(() => {
        if (!remoteConfig || minVersionNagShown)
            return;
        if (isVersionBelowMin(VERSION, remoteConfig.minimumVersion)) {
            setMinVersionNagShown(true);
            setUpdateVersion(remoteConfig.minimumVersion);
        }
    }, [remoteConfig, minVersionNagShown]);
    // Self-upgrade handler (Ctrl+U or /upgrade).
    const handleUpgrade = React.useCallback(() => {
        void (async () => {
            try {
                const { execFileSync } = await import("node:child_process");
                const isWin = process.platform === "win32";
                const npmBin = isWin ? "npm.cmd" : "npm";
                execFileSync(npmBin, ["i", "-g", "@dirgha/code@latest"], {
                    stdio: "inherit",
                    shell: isWin,
                });
            }
            catch {
                /* fall through to exit */
            }
            exit();
            process.exit(0);
        })();
    }, [exit]);
    React.useEffect(() => {
        const unsub = props.events.subscribe((ev) => {
            if (ev.type === "agent_start") {
                turnStartRef.current = Date.now();
                liveOutputTokensAccRef.current = 0;
                setLiveOutputTokens(0);
                setLiveDurationMs(0);
                setThinkingStreaming(false);
            }
            else if (ev.type === "thinking_start") {
                setThinkingStreaming(true);
            }
            else if (ev.type === "thinking_end") {
                setThinkingStreaming(false);
            }
            else if (ev.type === "text_delta" || ev.type === "thinking_delta") {
                // Approximate tokens as chars ÷ 4 — a common heuristic for English
                // text where avg token length is ~4 characters. Not exact but keeps
                // the tok/s rate plausible without an expensive tokenizer.
                liveOutputTokensAccRef.current += (ev.delta?.length ?? 0) / 4;
            }
            else if (ev.type === "usage") {
                // Only update the accumulator ref — the 1s tick interval reads it.
                // Calling setLiveOutputTokens here would double-render on usage events.
                liveOutputTokensAccRef.current = ev.outputTokens ?? 0;
            }
            else if (ev.type === "agent_end") {
                setLiveDurationMs(0);
                setLiveOutputTokens(0);
                liveOutputTokensAccRef.current = 0;
                // After the first response completes, refresh the system
                // message to drop the one-line session-title instruction so
                // the model does not keep emitting `[session-title]` on every
                // subsequent turn. Composing here uses cached project primer
                // + soul (cheap) and only runs once per session.
                if (firstTurnRef.current) {
                    firstTurnRef.current = false;
                    const msgs = historyRef.current;
                    if (msgs.length > 0 && msgs[0].role === "system") {
                        const primer = loadProjectPrimer(props.cwd);
                        const soul = loadSoul();
                        const refreshedSystem = composeSystemPrompt({
                            soul: soul.text,
                            modePreamble: modePreamble(mode),
                            primer: primer.primer,
                            ledgerContext: props.ledgerContext,
                            gitState: renderGitState(probeGitState(props.cwd)),
                            userSystem: props.systemPrompt,
                            firstTurn: false,
                        });
                        historyRef.current = [
                            { role: "system", content: refreshedSystem },
                            ...msgs.slice(1),
                        ];
                    }
                }
            }
        });
        return unsub;
    }, [props.events, mode, props.cwd, props.ledgerContext, props.systemPrompt]);
    // globalSpinnerFrame removed — spinner interval now lives inside
    // SpinnerGlyph so only the glyph subtree re-renders at 80ms, not the
    // entire App tree.
    // Tick the duration so the tok/s number updates while streaming.
    React.useEffect(() => {
        if (!busy)
            return;
        const t = setInterval(() => {
            if (turnStartRef.current > 0)
                setLiveDurationMs(Date.now() - turnStartRef.current);
            setLiveOutputTokens(liveOutputTokensAccRef.current);
        }, statusbarTickMs());
        return () => clearInterval(t);
    }, [busy]);
    // Audit writer for the Ink TUI path. Mirrors the one-shot main.ts and
    // readline runInteractive subscribers — without this, `dirgha audit`
    // is empty for the most common surface (the interactive UI). Effect
    // re-installs only if events ref changes (it shouldn't).
    React.useEffect(() => {
        const unsub = props.events.subscribe((ev) => {
            if (ev.type === "tool_exec_end") {
                void appendAudit({
                    kind: "tool",
                    actor: sessionIdRef.current,
                    summary: `${ev.id} ${ev.isError ? "error" : "done"} ${ev.durationMs}ms`,
                    toolId: ev.id,
                    isError: ev.isError,
                    durationMs: ev.durationMs,
                });
            }
            else if (ev.type === "agent_end") {
                void appendAudit({
                    kind: "turn-end",
                    actor: sessionIdRef.current,
                    summary: `model=${currentModel} stop=${ev.stopReason} in=${ev.usage.inputTokens} out=${ev.usage.outputTokens}`,
                    model: currentModel,
                    stopReason: ev.stopReason,
                    usage: ev.usage,
                });
            }
            else if (ev.type === "error") {
                void appendAudit({
                    kind: "error",
                    actor: sessionIdRef.current,
                    summary: ev.message,
                });
                if (ev.failoverModel) {
                    setPendingFailover({
                        failedModel: currentModel,
                        failoverModel: ev.failoverModel,
                        lastPrompt: lastUserPromptRef.current,
                    });
                }
            }
        });
        return unsub;
    }, [props.events, currentModel]);
    const models = React.useMemo(() => props.models ?? defaultModelCatalogue(), [props.models]);
    const slashCommands = props.slashCommands ?? [];
    // runTurnRef ensures handleSubmit always calls the latest runTurn closure
    // (which captures current currentModel, mode, etc.) without adding those
    // values to handleSubmit's deps and causing it to recreate on every change.
    const runTurnRef = React.useRef(() => Promise.resolve());
    const handleSubmit = React.useCallback((raw) => {
        const value = raw.trim();
        if (value.length === 0)
            return;
        // Non-disruptive queue: if a turn is still streaming, push the new
        // prompt onto the queue and clear the input so the user can keep
        // typing. The drain-effect below submits queued prompts FIFO once
        // `busy` flips false.
        if (busy) {
            setPromptQueue((q) => [...q, value]);
            setInput("");
            return;
        }
        setInput("");
        // Remember the last user prompt so we can re-submit it after a
        // failover model swap (D2 — auto-prompt model switch on failure).
        lastUserPromptRef.current = value;
        // Up/down arrow prompt history (keep last 100 prompts, newest first).
        setPromptHistory((prev) => {
            const deduped = prev.filter((p) => p !== value);
            return [value, ...deduped].slice(0, 100);
        });
        // A new submission supersedes any pending failover prompt.
        setPendingFailover(null);
        if (value === "/exit" || value === "/quit" || value === "/stop") {
            exit();
            return;
        }
        if (value === "/clear") {
            historyRef.current = initialHistory(props);
            setTranscript([]);
            projection.clear();
            return;
        }
        // `/model` with no args opens the picker; `/model <id>` sets directly.
        if (value === "/model" || value === "/models") {
            overlays.openOverlay("models");
            return;
        }
        if (value.startsWith("/model ")) {
            const rawId = value.slice("/model ".length).trim();
            if (rawId !== "") {
                // Resolve aliases (e.g. "ring" → "inclusionai/ring-2.6-1t:free")
                // before matching against the catalogue, mirroring the CLI flag path.
                const id = resolveModelAlias(rawId);
                // Exact match first, then suffix fallback — mirrors slash.ts /model handler.
                const exactMatch = PRICES.find((p) => p.model === id);
                if (exactMatch) {
                    setCurrentModel(exactMatch.model);
                    const note = {
                        kind: "notice",
                        id: randomUUID(),
                        text: `Model set to ${exactMatch.model}`,
                    };
                    setTranscript((prev) => [...prev, note]);
                }
                else {
                    const suffixMatch = PRICES.find((p) => p.model.endsWith("/" + id));
                    if (suffixMatch) {
                        setCurrentModel(suffixMatch.model);
                        const note = {
                            kind: "notice",
                            id: randomUUID(),
                            text: `Model set to ${suffixMatch.model}`,
                        };
                        setTranscript((prev) => [...prev, note]);
                    }
                    else {
                        const note = {
                            kind: "notice",
                            id: randomUUID(),
                            text: `Invalid model: ${rawId}. Use /models to see the catalogue.`,
                        };
                        setTranscript((prev) => [...prev, note]);
                    }
                }
            }
            return;
        }
        if (value === "/help" || value === "/?") {
            overlays.openOverlay("help");
            return;
        }
        // `/theme` with no args opens the picker; `/theme <name>` sets directly.
        if (value === "/theme" || value === "/themes") {
            overlays.openOverlay("theme");
            return;
        }
        // `/sandbox` with no args opens the picker; `/sandbox <mode>` sets directly.
        if (value === "/sandbox") {
            overlays.openOverlay("sandbox");
            return;
        }
        // /upgrade and /self-update trigger npm install + restart.
        if (value === "/upgrade" ||
            value === "/self-update" ||
            value === "/update --self") {
            const note = {
                kind: "notice",
                id: randomUUID(),
                text: "Upgrading @dirgha/code to latest via npm…",
            };
            setTranscript((prev) => [...prev, note]);
            handleUpgrade();
            return;
        }
        // Anything else starting with `/` goes through the SlashRegistry — that
        // covers /init /keys /memory /compact /setup /login /status /resume
        // /session /history /fleet /account /config /mode and friends.
        // The hardcoded branches above (clear/help/model[s]/theme/upgrade) ran first
        // because they open Ink overlays or trigger self-upgrade and don't fit
        // the registry string-output contract. Without this dispatch,
        // unrecognised slash commands fell through to runTurn() and were sent
        // to the LLM as user prompts — surprising behaviour that S1/2026-04-27
        // fixes.
        if (value.startsWith("/")) {
            const ctx = {
                get model() {
                    return currentModel;
                },
                get sessionId() {
                    return sessionIdRef.current;
                },
                setModel: (m) => setCurrentModel(m),
                showHelp: () => "",
                compact: async () => "(compaction is automatic)",
                clear: () => {
                    historyRef.current = initialHistory(props);
                    setTranscript([]);
                    projection.clear();
                },
                listSessions: async () => {
                    const { listSessions } = await import("../../state/index.js");
                    const entries = await listSessions(20);
                    if (entries.length === 0)
                        return "(no saved sessions)";
                    const lines = entries.map((e) => {
                        const d = e.startedAt.slice(0, 16).replace("T", " ");
                        const title = e.title ? e.title : e.sessionId.slice(0, 12);
                        return `  ${d}  ${title}`;
                    });
                    if (entries.length === 20) {
                        lines.push(`  (showing 20 — use /session load <id> to restore)`);
                    }
                    return lines.join("\n");
                },
                loadSession: async (id) => {
                    const s = await props.sessions.open(id);
                    return s ? `Loaded ${id}.` : `Session ${id} not found.`;
                },
                listSkills: async () => "(run `dirgha skills` for the full list)",
                showCost: () => `model=${currentModel}`,
                exit: (code = 0) => {
                    exit();
                    process.exit(code);
                },
                getToken: () => {
                    // Token loads asynchronously after mount; return null
                    // gracefully so slash commands don't crash on first call.
                    return tokenRef.current;
                },
                setToken: (newToken) => {
                    tokenRef.current = newToken;
                },
                apiBase: () => process.env["DIRGHA_API_BASE"] ??
                    process.env["DIRGHA_GATEWAY_URL"] ??
                    "https://api.dirgha.ai",
                upgradeUrl: () => process.env["DIRGHA_UPGRADE_URL"] ??
                    "https://dirgha.ai/billing/upgrade",
                status: (msg) => {
                    setTranscript((prev) => [
                        ...prev,
                        { kind: "notice", id: randomUUID(), text: msg },
                    ]);
                },
                requestKey: (keyName) => {
                    setPendingKey({ keyName, retryInput: "" });
                },
                getMode: () => mode,
                setMode: (m) => setMode(m),
                getTheme: () => props.config.theme ?? "readable",
                setTheme: () => undefined,
                getSandbox: () => sandboxModeRef.current,
                setSandbox: (next) => {
                    sandboxModeRef.current = next;
                },
                getSession: () => null,
                getSessionStore: () => props.sessions,
                getProvider: () => props.providers.forModel(currentModel),
                getSummaryModel: () => props.config.summaryModel,
            };
            void (async () => {
                try {
                    const result = await props.slashRegistry.dispatch(value, ctx);
                    if (result.handled) {
                        const text = result.output ? String(result.output) : "(ok)";
                        setTranscript((prev) => [
                            ...prev,
                            { kind: "notice", id: randomUUID(), text },
                        ]);
                    }
                    else {
                        setTranscript((prev) => [
                            ...prev,
                            {
                                kind: "notice",
                                id: randomUUID(),
                                text: `Unknown command: ${value.split(" ")[0]}. Type /help for the list.`,
                            },
                        ]);
                    }
                }
                catch (err) {
                    setTranscript((prev) => [
                        ...prev,
                        {
                            kind: "notice",
                            id: randomUUID(),
                            text: `[slash error] ${err instanceof Error ? err.message : String(err)}`,
                        },
                    ]);
                }
            })();
            return;
        }
        const userItem = {
            kind: "user",
            id: randomUUID(),
            text: value,
        };
        setTranscript((prev) => [...prev, userItem]);
        historyRef.current.push({ role: "user", content: value });
        void sessionRef.current?.append({
            type: "message",
            ts: new Date().toISOString(),
            message: { role: "user", content: value },
        });
        void runTurnRef.current();
    }, [
        busy,
        exit,
        props.registry,
        props.cwd,
        props.events,
        props.providers,
        props.sessions,
        props.config,
        props.ledgerContext,
        props.slashCommands,
        props.systemPrompt,
        projection.clear,
        overlays.openOverlay,
        overlays.closeOverlay,
        overlays.setAtQuery,
        overlays.setSlashQuery,
        overlays.setActive,
        overlays.active,
        handleUpgrade,
    ]);
    const runTurn = async () => {
        setBusy(true);
        const abort = new AbortController();
        abortRef.current = abort;
        // KB auto-inject: refresh the system message (index 0) with KB
        // context relevant to the current user turn before sending to the
        // model. Wrapped in try/catch so a KB failure never blocks a turn.
        if (props.config.kbAutoInject !== false) {
            try {
                const userTurn = lastUserPromptRef.current;
                if (userTurn) {
                    const kbCtx = await queryKb(userTurn);
                    if (kbCtx !== undefined) {
                        const msgs = historyRef.current;
                        if (msgs.length > 0 && msgs[0].role === "system") {
                            const primer = loadProjectPrimer(props.cwd);
                            const soul = loadSoul();
                            const refreshedSystem = composeSystemPrompt({
                                soul: soul.text,
                                modePreamble: modePreamble(mode),
                                primer: primer.primer,
                                ledgerContext: props.ledgerContext,
                                kbContext: kbCtx,
                                gitState: renderGitState(probeGitState(props.cwd)),
                                userSystem: props.systemPrompt,
                            });
                            historyRef.current = [
                                { role: "system", content: refreshedSystem },
                                ...msgs.slice(1),
                            ];
                        }
                    }
                }
            }
            catch {
                /* KB unavailable — proceed without it */
            }
        }
        try {
            const executor = createToolExecutor({
                registry: props.registry,
                cwd: props.cwd,
                sessionId: sessionIdRef.current,
                sandboxMode: sandboxModeRef.current,
                onProgress: (toolId, message) => {
                    props.events.emit({
                        type: "tool_exec_progress",
                        id: toolId,
                        message,
                    });
                },
            });
            const sanitized = props.registry.sanitize({ descriptionLimit: 200 });
            const provider = props.providers.forModel(currentModel);
            const approvalBus = approvalBusRef.current;
            // Context-aware compaction: trigger at 75 % of the active model's
            // window. Same machinery as the readline + one-shot paths so the
            // Ink TUI doesn't 400-overflow on long sessions.
            const compactionTransform = async (msgs) => (await maybeCompact(msgs, {
                triggerTokens: Math.floor(contextWindowFor(currentModel) * 0.75),
                preserveLastTurns: props.config.compaction?.preserveLastTurns ?? 6,
                summarizer: provider,
                summaryModel: props.config.summaryModel ?? currentModel,
            })).messages;
            const userHooks = buildAgentHooksFromConfig(props.config);
            const composedHooks = composeHooks(enforceMode(mode), userHooks);
            const autoApprove = isAutoApprove(mode);
            loopDetectorRef.current.reset();
            const prevHistoryLen = historyRef.current.length;
            const result = await runAgentLoop({
                sessionId: sessionIdRef.current,
                model: currentModel,
                messages: historyRef.current,
                tools: sanitized.definitions,
                maxTurns: props.config.maxTurns,
                provider,
                toolExecutor: executor,
                approvalBus,
                events: props.events,
                signal: abort.signal,
                contextTransform: compactionTransform,
                errorClassifier: createErrorClassifier(),
                session: sessionRef.current ?? undefined,
                loopDetector: loopDetectorRef.current,
                autoApprove,
                ...(composedHooks !== undefined ? { hooks: composedHooks } : {}),
            });
            historyRef.current = result.messages;
            for (const msg of result.messages.slice(prevHistoryLen)) {
                const session = sessionRef.current;
                if (!session)
                    continue;
                try {
                    await session.append({
                        type: "message",
                        ts: new Date().toISOString(),
                        message: msg,
                    });
                }
                catch {
                    /* swallow — session write failures must not crash the loop */
                }
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Only match provider-key errors, not errors from deep inside the agent
            // loop that happen to contain a similar pattern. The message must start
            // with the key name and end with "is required" to qualify.
            const keyMatch = /^([A-Z][A-Z0-9_]+_API_KEY) is required$/.exec(msg);
            if (keyMatch?.[1]) {
                setPendingKey({
                    keyName: keyMatch[1],
                    retryInput: lastUserPromptRef.current,
                });
            }
            else {
                projection.appendLive({
                    kind: "error",
                    id: randomUUID(),
                    message: msg,
                });
            }
        }
        finally {
            // If the turn was cancelled via ESC / Ctrl-C, inject the notice
            // synchronously into liveItemsRef before commitLive reads it — this
            // avoids the React-state race where appendLive's functional updater
            // hasn't flushed to the ref yet when commitLive runs.
            const interruptMsg = interruptMsgRef.current;
            interruptMsgRef.current = null;
            if (abort.signal.aborted && interruptMsg !== null) {
                projection.appendLiveSync({
                    kind: "notice",
                    id: randomUUID(),
                    text: interruptMsg,
                });
            }
            const committed = projection.commitLive();
            if (committed.length > 0)
                setTranscript((prev) => [...prev, ...committed]);
            setBusy(false);
            abortRef.current = null;
        }
    };
    // Keep runTurnRef pointed at the latest runTurn closure so
    // handleSubmit always calls the current version without adding
    // runTurn's deps to handleSubmit's dependency array.
    React.useEffect(() => {
        runTurnRef.current = runTurn;
    });
    // Drain the prompt queue when a turn finishes. Drains ALL queued
    // prompts in a single batch to avoid N sequential LLM round-trips.
    // Errors are caught so a single failure does not orphan remaining items.
    React.useEffect(() => {
        if (busy)
            return;
        if (promptQueue.length === 0)
            return;
        const queue = promptQueue;
        setPromptQueue([]);
        // Batch all queued prompts as separate user messages, then run
        // the agent loop once for the whole batch.
        for (const q of queue) {
            lastUserPromptRef.current = q;
            setPromptHistory((prev) => {
                const deduped = prev.filter((p) => p !== q);
                return [q, ...deduped].slice(0, 100);
            });
            historyRef.current.push({ role: "user", content: q });
            setTranscript((prev) => [
                ...prev,
                { kind: "user", id: randomUUID(), text: q },
            ]);
            void sessionRef.current?.append({
                type: "message",
                ts: new Date().toISOString(),
                message: { role: "user", content: q },
            });
        }
        void (async () => {
            try {
                await runTurnRef.current();
            }
            catch (err) {
                // Log but don't crash — remaining prompts already have
                // user-message entries in history so they won't be lost.
                setTranscript((prev) => [
                    ...prev,
                    {
                        kind: "error",
                        id: randomUUID(),
                        message: `Batch queue error: ${err instanceof Error ? err.message : String(err)}`,
                    },
                ]);
                setBusy(false);
            }
        })();
    }, [busy, promptQueue, handleSubmit]);
    // Global Esc handler. Priority order:
    //   1. If an overlay (other than @-file) is open → close it.
    //   2. If a turn is streaming → abort it (cancels the in-flight LLM
    //      request via the AbortController plumbed through runAgentLoop).
    //   3. If the input box has draft text → clear it.
    //   (step 3 is skipped when vimMode is on — InputBox's own handler
    //    enters NORMAL mode; clearing here would destroy the text.)
    // Always active so Esc behaves like the user expects regardless of
    // which surface they're looking at. The atfile overlay handles its
    // own Esc (cancel completion) so we skip step 1 there.
    useInput((_ch, key) => {
        if (!key.escape)
            return;
        if (overlays.active !== null && overlays.active !== "atfile") {
            overlays.closeOverlay();
            return;
        }
        if (busy && abortRef.current !== null) {
            interruptMsgRef.current = "Cancelled.";
            abortRef.current.abort();
            return;
        }
        if (input.length > 0 && props.config.vimMode !== true)
            setInput("");
    });
    // Ctrl-C handler: if a turn is running, abort it and show "[Interrupted]"
    // in the transcript (matching the readline path in src/cli/interactive.ts).
    // Idle exit is handled by InputBox's own Ctrl-C handler (2-press safety
    // within 1.5s) — we don't override that here.
    useInput((ch, key) => {
        if (!(key.ctrl && ch === "c"))
            return;
        if (busy && abortRef.current !== null) {
            interruptMsgRef.current = "[Interrupted]";
            abortRef.current.abort();
        }
    });
    const handleModelPick = React.useCallback((id) => {
        overlays.closeOverlay();
        // Dedupe: a stale picker callback firing after the model is already
        // set should not spam the transcript with redundant notices.
        setCurrentModel((prev) => {
            if (prev === id)
                return prev;
            const note = {
                kind: "notice",
                id: randomUUID(),
                text: `Model set to ${id}`,
            };
            setTranscript((t) => [...t, note]);
            // 1.10.1 — Warn the user inline if the new model's provider has
            // no API key configured. Without this, the next ask silently
            // 401s and the user is left wondering why nothing happens.
            // Best-effort: provider construction throws ProviderError when
            // the env var is missing; we catch + render the missing-env hint.
            try {
                props.providers.forModel(id);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const m = /^([A-Z][A-Z0-9_]+_API_KEY) is required$/.exec(msg);
                if (m?.[1]) {
                    // Open inline key entry instead of a static hint — the user can
                    // paste their key right here without leaving the REPL.
                    setPendingKey({ keyName: m[1], retryInput: "" });
                    pendingModelRef.current = id;
                    return prev; // Don't switch model until the key is saved
                }
            }
            return id;
        });
    }, [overlays, props.providers]);
    const handleKeySetSave = React.useCallback((value) => {
        const keyName = pendingKey?.keyName ?? "";
        void (async () => {
            try {
                await saveKey(keyName, value);
                const retryText = pendingKey?.retryInput ?? "";
                const pendingModel = pendingModelRef.current;
                pendingModelRef.current = null;
                setPendingKey(null);
                if (pendingModel) {
                    setCurrentModel(pendingModel);
                    setTranscript((prev) => [
                        ...prev,
                        {
                            kind: "notice",
                            id: randomUUID(),
                            text: `Saved ${keyName}. Model set to ${pendingModel}.`,
                        },
                    ]);
                }
                else {
                    setTranscript((prev) => [
                        ...prev,
                        {
                            kind: "notice",
                            id: randomUUID(),
                            text: `Saved ${keyName}. Model ready.`,
                        },
                    ]);
                }
                if (retryText) {
                    setInput(retryText);
                }
            }
            catch (err) {
                setPendingKey(null);
                setTranscript((prev) => [
                    ...prev,
                    {
                        kind: "error",
                        id: randomUUID(),
                        message: `Failed to save key: ${err instanceof Error ? err.message : String(err)}`,
                    },
                ]);
            }
        })();
    }, [pendingKey]);
    const handleAtPick = React.useCallback((path) => {
        setInput((current) => overlays.spliceAtSelection(current, path));
        overlays.setAtQuery(null);
        overlays.setActive(null);
    }, [overlays]);
    // Slash commands that take no arguments — pressing Enter on the
    // autocomplete suggestion submits them immediately instead of forcing
    // a second Enter. Anything that DOES take args (model, theme, mode,
    // memory, session, ...) gets a trailing space and waits for the arg.
    const ARGLESS_SLASH = React.useMemo(() => new Set([
        "help",
        "exit",
        "quit",
        "clear",
        "compact",
        "models",
        "theme",
        "cost",
        "status",
        "history",
        "login",
        "logout",
        "setup",
        "upgrade",
        "update",
    ]), []);
    const handleSlashPick = React.useCallback((name) => {
        // Replace the leading /<typed> with /<picked>. For commands that
        // need an argument we append a trailing space and wait for the user
        // to type it. For argless commands (1.12.0 fix) we submit immediately
        // — without this, /models<Enter> required pressing Enter TWICE: once
        // to "pick" the autocomplete suggestion, again to submit.
        let spliced = "";
        setInput((current) => {
            spliced = overlays.spliceSlashSelection(current, name);
            if (spliced === `/${name}` && !ARGLESS_SLASH.has(name)) {
                return `${spliced} `; // ready for arg input
            }
            return spliced;
        });
        overlays.setSlashQuery(null);
        // Argless command — fire submit on the next tick so React commits
        // the setInput state first. handleSubmit's `value === '/models'`
        // branch then opens the overlay correctly.
        if (ARGLESS_SLASH.has(name)) {
            setTimeout(() => handleSubmit(spliced || `/${name}`), 0);
        }
    }, [overlays, ARGLESS_SLASH, handleSubmit]);
    const inputFocus = pendingKey === null &&
        pendingApproval === null &&
        (overlays.active === null ||
            overlays.active === "atfile" ||
            overlays.active === "slash");
    // Active theme name — driven by local state so the picker can flip it
    // live. Initial value comes from config; subsequent changes are
    // persisted to ~/.dirgha/config.json so future sessions pick it up.
    const [themeName, setThemeName] = React.useState((props.config.theme ?? "readable"));
    const handleSandboxPick = React.useCallback((next) => {
        overlays.closeOverlay();
        sandboxModeRef.current = next;
        const note = {
            kind: "notice",
            id: randomUUID(),
            text: `Sandbox mode → ${next}`,
        };
        setTranscript((t) => [...t, note]);
        void (async () => {
            try {
                const dir = pathJoin(homedir(), ".dirgha");
                await mkdir(dir, { recursive: true });
                const path = pathJoin(dir, "config.json");
                const text = await readFile(path, "utf8").catch(() => "");
                const cfg = text ? JSON.parse(text) : {};
                cfg.sandbox = next;
                await writeFile(path, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
            }
            catch {
                /* best-effort persistence */
            }
        })();
    }, [overlays]);
    const handleThemePick = React.useCallback((name) => {
        overlays.closeOverlay();
        setThemeName(name);
        const note = {
            kind: "notice",
            id: randomUUID(),
            text: `Theme set to ${name}`,
        };
        setTranscript((t) => [...t, note]);
        void (async () => {
            try {
                const dir = pathJoin(homedir(), ".dirgha");
                await mkdir(dir, { recursive: true });
                const path = pathJoin(dir, "config.json");
                const text = await readFile(path, "utf8").catch(() => "");
                const cfg = text ? JSON.parse(text) : {};
                cfg.theme = name;
                await writeFile(path, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
            }
            catch {
                /* best-effort persistence */
            }
        })();
    }, [overlays]);
    const liveJsx = React.useMemo(() => (_jsxs(_Fragment, { children: [_overflowCount > 0 && (_jsx(Box, { paddingX: 1, children: _jsxs(Text, { color: "gray", italic: true, children: ["[\u2191 ", _overflowCount, " more item", _overflowCount === 1 ? "" : "s", " above \u2014 scroll up]"] }) })), renderTranscript(_visibleLiveItems, thinkingStreaming)] })), [_visibleLiveItems, thinkingStreaming, _overflowCount]);
    const providerEntries = React.useMemo(() => buildProviderEntries(models, currentModel), [models, currentModel]);
    const spinnerCtx = React.useMemo(() => ({ busy, frame: 0 }), [busy]);
    const renderTranscriptItem = React.useCallback((item) => _jsx(TranscriptRow, { item: item }, item.id), []);
    // Logo is emitted via process.stdout.write() before Ink mounts (see
    // tui/ink/index.ts). Keeping it out of Ink's render tree avoids the
    // re-emission flicker users hit when transcripts overflow the
    // viewport: Ink's onRender prepends `fullStaticOutput` (which includes
    // the logo) on every overflow redraw, repainting it on every chat
    // turn that fills the screen. `use-flicker-detector` already warns
    // when this is about to happen.
    return (_jsx(ThemeProvider, { activeTheme: themeName, children: _jsx(SpinnerContext.Provider, { value: spinnerCtx, children: _jsxs(Box, { flexDirection: "column", children: [_jsx(Static, { items: transcript, children: (item) => (_jsx(Box, { flexDirection: "column", children: renderTranscriptItem(item) }, item.id)) }), _jsx(Box, { flexDirection: "column", children: liveJsx }), busy && projection.liveItems.length === 0 && _jsx(GeneratingIndicator, { startedAtMs: turnStartRef.current, liveOutputTokens: liveOutputTokens }), pendingApproval !== null && approvalBusRef.current && (_jsx(ApprovalPrompt, { request: pendingApproval, onResolve: (decision) => {
                            approvalBusRef.current?.resolve(pendingApproval.id, decision);
                        } })), pendingFailover !== null && (_jsx(ModelSwitchPrompt, { failedModel: pendingFailover.failedModel, failoverModel: pendingFailover.failoverModel, onAccept: (failover) => {
                            const lastPrompt = pendingFailover.lastPrompt;
                            setCurrentModel(failover);
                            setPendingFailover(null);
                            // Re-submit the failed prompt against the new model.
                            if (lastPrompt) {
                                setTimeout(() => handleSubmit(lastPrompt), 0);
                            }
                        }, onReject: () => setPendingFailover(null), onPicker: () => {
                            setPendingFailover(null);
                            overlays.openOverlay("models");
                        } })), _jsx(SubagentPanel, { events: props.events }), _jsx(GPUJobIndicator, {}), _jsx(PromptQueueIndicator, { queued: promptQueue }), _jsx(InputBox, { value: input, onChange: setInput, onSubmit: handleSubmit, busy: busy, liveDurationMs: liveDurationMs, vimMode: props.config.vimMode === true, onAtQueryChange: overlays.setAtQuery, onSlashQueryChange: overlays.setSlashQuery, onRequestOverlay: overlays.openOverlay, promptHistory: promptHistory, onRequestYoloToggle: () => {
                            const next = mode === "yolo" ? "act" : "yolo";
                            setMode(next);
                            // Wire the approval bus so mid-turn tool calls are immediately
                            // affected — not just the next turn's autoApprove flag.
                            approvalBusRef.current?.setApproveAll(next === "yolo");
                            setTranscript((prev) => [
                                ...prev,
                                {
                                    kind: "notice",
                                    id: randomUUID(),
                                    text: next === "yolo"
                                        ? "YOLO mode ON — every tool call is auto-approved. Ctrl+Y to exit."
                                        : "YOLO mode OFF — back to standard confirmation.",
                                },
                            ]);
                        }, onRequestUpgrade: handleUpgrade, inputFocus: inputFocus, queueLength: promptQueue.length, onDequeueForEdit: () => {
                            // Read from ref so we get the latest queue without capturing a
                            // stale closure. Calling setInput inside a setState updater would
                            // violate React's purity requirement for updater functions.
                            const q = promptQueueRef.current;
                            if (q.length === 0)
                                return;
                            const last = q[q.length - 1];
                            setInput(last);
                            setPromptQueue((prev) => prev.slice(0, -1));
                        } }), healthResult !== null && !healthResult.allOk && (_jsx(Box, { paddingX: 1, children: _jsxs(Text, { color: "yellow", children: ["[! System check: ", healthResult.failures.length, " issue", healthResult.failures.length !== 1 ? "s" : "", " found \u2014 run 'dirgha doctor' for details]"] }) })), overlays.active === "atfile" && overlays.atQuery !== null && (_jsx(AtFileComplete, { cwd: props.cwd, query: overlays.atQuery, onPick: handleAtPick, onCancel: () => {
                            overlays.setAtQuery(null);
                            overlays.setActive(null);
                        } })), overlays.active === "slash" && overlays.slashQuery !== null && (_jsx(SlashComplete, { commands: slashCommands, query: overlays.slashQuery, onPick: handleSlashPick, onCancel: () => {
                            overlays.setSlashQuery(null);
                            overlays.setActive(null);
                        } })), overlays.active === "models" &&
                        pickerStage === "provider" &&
                        (() => {
                            if (providerEntries.length === 0) {
                                // Fall through to flat ModelPicker if no providers (catalogue empty).
                                return null;
                            }
                            return (_jsx(ProviderPicker, { providers: providerEntries, onPick: (providerId) => {
                                    setPickerProvider(providerId);
                                    if (providerId === "openrouter") {
                                        setPickerStage("or-company");
                                    }
                                    else {
                                        setPickerStage("model");
                                    }
                                }, onCancel: () => {
                                    setPickerStage("provider");
                                    setPickerProvider(null);
                                    overlays.closeOverlay();
                                } }));
                        })(), overlays.active === "models" && pickerStage === "or-company" && (() => {
                        // Build company entries from OpenRouter models
                        const orModels = models.filter(m => m.provider === "openrouter");
                        const companyMap = new Map();
                        for (const m of orModels) {
                            const prefix = m.id.startsWith("~") ? m.id.slice(1).split("/")[0] : m.id.split("/")[0];
                            if (prefix)
                                companyMap.set(prefix, (companyMap.get(prefix) ?? 0) + 1);
                        }
                        const COMPANY_LABELS = {
                            anthropic: "Anthropic", deepseek: "DeepSeek", google: "Google",
                            moonshotai: "Moonshot / Kimi", minimax: "MiniMax", qwen: "Qwen / Alibaba",
                            inclusionai: "Inclusion AI (Ring)", meta: "Meta", openai: "OpenAI",
                            nvidia: "NVIDIA", poolside: "Poolside", tencent: "Tencent",
                            "z-ai": "Z.ai",
                        };
                        const COMPANY_BLURB = {
                            deepseek: "v4-pro · v4-flash · R1", google: "Gemini 3.1 Pro · Flash",
                            moonshotai: "Kimi K2.6 · K2-Thinking", minimax: "M2.7",
                            qwen: "Qwen3.6 Max · Flash · Coder", inclusionai: "Ring 2.6 1T (free)",
                            anthropic: "Claude Opus/Sonnet/Haiku", openai: "GPT-5.5 Pro · Mini",
                        };
                        const PIN_ORDER = ["deepseek", "moonshotai", "minimax", "google", "qwen", "inclusionai", "anthropic", "openai", "meta", "nvidia"];
                        const entries = [...companyMap.entries()]
                            .sort(([a], [b]) => {
                            const ai = PIN_ORDER.indexOf(a), bi = PIN_ORDER.indexOf(b);
                            if (ai !== -1 && bi !== -1)
                                return ai - bi;
                            if (ai !== -1)
                                return -1;
                            if (bi !== -1)
                                return 1;
                            return a.localeCompare(b);
                        })
                            .map(([id, count]) => ({
                            id,
                            label: COMPANY_LABELS[id] ?? id,
                            modelCount: count,
                            blurb: COMPANY_BLURB[id],
                            isCurrent: currentModel.startsWith(id + "/") || currentModel.startsWith("~" + id + "/"),
                        }));
                        return (_jsx(OpenRouterCompanyPicker, { companies: entries, onPick: (companyId) => {
                                setPickerOrCompany(companyId);
                                setPickerStage("model");
                            }, onCancel: () => {
                                setPickerStage("provider");
                                setPickerProvider(null);
                                setPickerOrCompany(null);
                            } }));
                    })(), overlays.active === "models" && pickerStage === "model" && (_jsx(ModelPicker, { models: models.filter((m) => {
                            if (pickerProvider !== "openrouter" || !pickerOrCompany) {
                                return m.provider === pickerProvider;
                            }
                            const bare = m.id.startsWith("~") ? m.id.slice(1) : m.id;
                            return m.provider === "openrouter" && bare.startsWith(pickerOrCompany + "/");
                        }), current: currentModel, onPick: (id) => {
                            handleModelPick(id);
                            setPickerStage("provider");
                            setPickerProvider(null);
                            setPickerOrCompany(null);
                        }, onCancel: () => {
                            // Esc inside ModelPicker → back to company step for OR, provider for others
                            if (pickerProvider === "openrouter") {
                                setPickerStage("or-company");
                            }
                            else {
                                setPickerStage("provider");
                                setPickerProvider(null);
                            }
                        } })), overlays.active === "help" && (_jsx(HelpOverlay, { slashCommands: slashCommands, onClose: overlays.closeOverlay })), overlays.active === "theme" && (_jsx(ThemePicker, { current: themeName, onPick: handleThemePick, onCancel: overlays.closeOverlay })), overlays.active === "sandbox" && (_jsx(SandboxPicker, { current: sandboxModeRef.current, onPick: handleSandboxPick, onCancel: overlays.closeOverlay })), pendingKey && (_jsx(KeySetOverlay, { keyName: pendingKey.keyName, onSave: handleKeySetSave, onCancel: () => setPendingKey(null) })), updateVersion !== null && (_jsx(Box, { paddingX: 1, children: _jsxs(Text, { color: "yellow", children: ["[v", updateVersion, " available \u2014 press Ctrl+U or /upgrade to upgrade]"] }) })), _jsx(StatusBar, { model: currentModel, provider: providerIdForModel(currentModel), inputTokens: projection.totals.inputTokens, outputTokens: projection.totals.outputTokens, costUsd: projection.totals.costUsd, cwd: props.cwd, busy: busy, mode: mode, contextWindow: contextWindowFor(currentModel), liveOutputTokens: liveOutputTokens, liveDurationMs: liveDurationMs, overflowDetected: flicker.overflowDetected, showMetrics: showRenderMetrics, renderMetrics: renderMetrics, activeTool: activeTools[0] })] }) }) }));
}
/**
 * Walk the transcript and fold consecutive `tool` items into a single
 * <ToolGroup>. Fold 3+ consecutive `thinking` items into a single
 * <ThinkingBlockGroup>. Non-tool / non-thinking items render via
 * <TranscriptRow>.
 */
function renderTranscript(items, thinkingStreaming) {
    const out = [];
    let toolBuf = [];
    let thinkBuf = [];
    const flushTools = () => {
        if (toolBuf.length === 0)
            return;
        out.push(_jsx(ToolGroup, { tools: toolBuf }, toolBuf[0].id));
        toolBuf = [];
    };
    const flushThinking = () => {
        if (thinkBuf.length === 0)
            return;
        if (thinkBuf.length >= 3) {
            out.push(_jsx(ThinkingBlockGroup, { blocks: thinkBuf }, thinkBuf[0].id));
        }
        else {
            for (const tb of thinkBuf) {
                out.push(_jsx(TranscriptRow, { item: { kind: "thinking", id: tb.id, content: tb.content }, isStreaming: thinkingStreaming }, tb.id));
            }
        }
        thinkBuf = [];
    };
    for (const item of items) {
        if (item.kind === "tool") {
            flushThinking();
            toolBuf.push({
                id: item.id,
                name: item.name,
                status: item.status,
                argSummary: item.argSummary,
                outputPreview: item.outputPreview,
                outputKind: item.outputKind,
                startedAt: item.startedAt,
                durationMs: item.durationMs,
            });
            continue;
        }
        if (item.kind === "thinking") {
            flushTools();
            thinkBuf.push({ id: item.id, content: item.content });
            continue;
        }
        flushTools();
        flushThinking();
        out.push(_jsx(TranscriptRow, { item: item, isStreaming: thinkingStreaming }, item.id));
    }
    flushTools();
    flushThinking();
    return out;
}
function TranscriptRow({ item, isStreaming = false, }) {
    switch (item.kind) {
        case "user":
            return (_jsxs(Box, { gap: 2, marginBottom: 1, children: [_jsx(Text, { color: "magenta", children: "\u276F" }), _jsx(Text, { color: "white", children: item.text })] }));
        case "text":
            return _jsx(StreamingText, { content: item.content });
        case "thinking":
            return _jsx(ThinkingBlock, { content: item.content, isStreaming: isStreaming });
        case "tool":
            // Should not be reached — tools are folded by renderTranscript() into
            // <ToolGroup>. Kept as a safety net so an unexpected tool item still
            // renders something rather than nothing.
            return (_jsx(ToolBox, { name: item.name, status: item.status, argSummary: item.argSummary, outputPreview: item.outputPreview, outputKind: item.outputKind, startedAt: item.startedAt, durationMs: item.durationMs }));
        case "error":
            return (_jsx(Box, { flexDirection: "column", marginBottom: 1, children: _jsxs(Box, { gap: 1, children: [_jsx(Text, { color: "red", bold: true, children: "\u2717" }), _jsx(Text, { color: "red", children: item.userMessage ?? item.message })] }) }));
        case "notice":
            return (_jsx(Box, { marginBottom: 1, children: _jsx(Text, { color: "yellow", children: item.text }) }));
    }
}
function GeneratingIndicator(props) {
    const palette = useTheme();
    const [now, setNow] = React.useState(Date.now());
    React.useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), statusbarTickMs());
        return () => clearInterval(t);
    }, []);
    const elapsedSec = props.startedAtMs > 0 ? Math.round((now - props.startedAtMs) / 1000) : 0;
    const slow = elapsedSec >= 5 && props.liveOutputTokens === 0;
    const label = slow
        ? `warming up · ${elapsedSec}s · first token can take 10–30s on free models`
        : `generating · ${elapsedSec}s`;
    return (_jsxs(Box, { gap: 1, marginBottom: 1, children: [_jsx(SpinnerGlyph, { isActive: true, color: palette.text.secondary }), _jsx(Text, { color: palette.text.secondary, dimColor: true, children: label })] }));
}
function initialHistory(props) {
    if (_cachedInitialMessages !== null)
        return _cachedInitialMessages;
    const base = props.initialMessages ? [...props.initialMessages] : [];
    // Detect resumed sessions — if the caller passed user/assistant
    // messages, the session already has history and the LLM should NOT
    // emit a session-title marker (we'd be retrofitting one onto an
    // already-named conversation).
    const isFreshSession = !base.some((m) => m.role === "user" || m.role === "assistant");
    // Boot context: mode preamble + project primer (DIRGHA.md) +
    // caller's --system. Without this, the Ink TUI starts with zero
    // project awareness — same parity-matrix #1 fix as the one-shot
    // path in cli/main.ts.
    const primer = loadProjectPrimer(props.cwd);
    const soul = loadSoul();
    const composedSystem = composeSystemPrompt({
        soul: soul.text,
        modePreamble: modePreamble(props.config.mode ?? "act"),
        primer: primer.primer,
        ledgerContext: props.ledgerContext,
        gitState: renderGitState(probeGitState(props.cwd)),
        userSystem: props.systemPrompt,
        firstTurn: isFreshSession,
    });
    base.unshift({ role: "system", content: composedSystem });
    _cachedInitialMessages = base;
    return base;
}
function providerIdForModel(model) {
    // Delegate to providers/dispatch.ts so the StatusBar readout
    // matches the actual runtime routing at all times.
    try {
        return routeModel(model);
    }
    catch {
        return "local";
    }
}
const PROVIDER_BLURB = {
    anthropic: "Claude — Opus, Sonnet, Haiku",
    openai: "GPT family — gpt-5.5, o1/o3",
    gemini: "Google — Gemini Pro, Flash",
    openrouter: "Aggregator — 370+ models, free tier",
    nvidia: "NIM — Kimi K2.5, DeepSeek V4, Qwen 3",
    ollama: "Local Ollama models",
    llamacpp: "Local llama.cpp models",
    fireworks: "Hosted open models",
    deepseek: "DeepSeek native — V3.2, reasoner",
    mistral: "Mistral — Codestral, Magistral",
    cohere: "Cohere — Command R / Command A",
    cerebras: "Wafer-scale — Qwen3, Llama 4",
    together: "Open-source hub — Llama, Qwen",
    perplexity: "Sonar — search-grounded",
    xai: "Grok 4 family — code + reasoning",
    groq: "LPU — very low latency",
    zai: "GLM-4.6 — long-context",
    local: "Local models",
};
const PROVIDER_ENV = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    fireworks: "FIREWORKS_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    mistral: "MISTRAL_API_KEY",
    cohere: "COHERE_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    together: "TOGETHER_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
    xai: "XAI_API_KEY",
    groq: "GROQ_API_KEY",
    zai: "ZAI_API_KEY",
};
const PROVIDER_LABEL = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    gemini: "Google AI",
    openrouter: "OpenRouter",
    nvidia: "NVIDIA NIM",
    ollama: "Ollama (local)",
    llamacpp: "llama.cpp (local)",
    fireworks: "Fireworks",
    deepseek: "DeepSeek",
    mistral: "Mistral",
    cohere: "Cohere",
    cerebras: "Cerebras",
    together: "Together AI",
    perplexity: "Perplexity",
    xai: "xAI (Grok)",
    groq: "Groq",
    zai: "Z.AI / GLM",
    local: "Local",
};
/**
 * Synchronously check whether an env var exists in ~/.dirgha/keys.json.
 * Used by buildProviderEntries as a fallback when process.env doesn't
 * contain the key yet (race with startup hydration).
 */
function tryReadKeyFromStore(envVar) {
    try {
        const path = pathJoin(homedir(), ".dirgha", "keys.json");
        if (!existsSync(path))
            return false;
        const raw = readFileSync(path, "utf8");
        const store = JSON.parse(raw);
        return typeof store[envVar] === "string" && store[envVar].length > 0;
    }
    catch {
        return false;
    }
}
/**
 * Group the flat model catalogue into per-provider entries for stage 1
 * of the picker. Skips providers with zero models in the catalogue.
 */
function buildProviderEntries(models, currentModel) {
    const buckets = new Map();
    for (const m of models) {
        const list = buckets.get(m.provider) ?? [];
        list.push(m);
        buckets.set(m.provider, list);
    }
    const currentProvider = models.find((m) => m.id === currentModel)?.provider;
    const out = [];
    for (const [id, items] of buckets) {
        const env = PROVIDER_ENV[id];
        // Check env vars AND keys.json (env vars win). keys.json is hydrated
        // into process.env by hydrateEnvFromKeyStore at startup, but this
        // synchronous fallback handles the edge case where hydration hasn't
        // run yet (e.g. TUI mounts before startup hydration completes).
        const hasKey = env
            ? !!process.env[env] || !!tryReadKeyFromStore(env)
            : true; // local providers don't need keys
        out.push({
            id,
            label: PROVIDER_LABEL[id] ?? id,
            modelCount: items.length,
            hasKey,
            blurb: PROVIDER_BLURB[id],
            isCurrent: id === currentProvider,
        });
    }
    // Sort by hasKey desc (configured first), then by name.
    out.sort((a, b) => Number(b.hasKey) - Number(a.hasKey) || a.label.localeCompare(b.label));
    return out;
}
function defaultModelCatalogue() {
    return PRICES.map((p) => ({
        id: p.model,
        provider: p.provider,
        tier: tierFromPrice(p.inputPerM),
    }));
}
function tierFromPrice(inputPerM) {
    if (inputPerM === 0)
        return "free";
    if (inputPerM < 0.5)
        return "basic";
    if (inputPerM < 5)
        return "pro";
    return "premium";
}
//# sourceMappingURL=App.js.map