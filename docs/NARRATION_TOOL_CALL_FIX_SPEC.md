# Narration & Multi-Agent Tool Calling Fix Spec

**Date:** 2026-04-22  
**Status:** Analysis Complete — Implementation Pending

---

## 1. PROBLEM STATEMENT

### 1.1 Narration Issues

| # | Issue | Location | Severity |
|---|-------|----------|----------|
| N1 | **No narration.ts module exists** — System prompt says "don't restate, call tools immediately, report back tersely" but there's no implementation enforcing this | `src/agent/context.ts` (system prompt), `src/agent/loop.ts` | P0 |
| N2 | **No structured event system** — `onText`/`onTool` callbacks exist but no `onAgent`/`onPhase`/`onFinding` for multi-agent orchestration | `src/repl/index.ts:103-115` | P0 |
| N3 | **No "thinking" narration** — The system discipline says "don't announce what you're about to do" but users need SOME signal that work is happening | `src/agent/loop.ts` | P1 |
| N4 | **Tool call narration is bare** — `renderToolBox` shows tool name + input but no WHY, no context, no summary | `src/tui/` (renderer missing) | P1 |
| N5 | **No multi-agent progress narration** — `spawnAgent` and `orchestrateTask` have `onProgress` callbacks that aren't used | `src/agent/spawn-agent.ts` | P1 |
| N6 | **No phase/context narration** — User sees streaming text with no structure: "now doing X", "switching to agent Y", "verifying Z" | `src/agent/loop.ts` | P1 |
| N7 | **Sub-agent output is raw concatenated text** — No structured findings, no summary sections, no bullet points | `src/agent/spawn-agent.ts:90` | P2 |

### 1.2 Multi-Agent Issues

| # | Issue | Location | Severity |
|---|-------|----------|----------|
| M1 | **Sub-agent isolation is weak** — Each spawn uses `callGateway` directly; no shared context, no result schema | `src/agent/spawn-agent.ts` | P0 |
| M2 | **No structured result format** — `ToolResult` is just `{ tool, result, error }` — no metadata about what was found/decided | `src/tools/index.ts:43` | P0 |
| M3 | **OrchestrateTask runs sequentially** — Plan→Code→Verify could be parallel for independent parts | `src/agent/spawn-agent.ts:100-135` | P2 |
| M4 | **Agent types are too coarse** — 6 types (explore/plan/verify/code/research/custom) miss nuance; allowlists too restrictive | `src/agent/spawn-agent.ts:15-22` | P2 |
| M5 | **No agent-to-parent handoff** — Sub-agent findings aren't summarized elegantly for parent consumption | `src/agent/spawn-agent.ts` | P1 |
| M6 | **ColonyManager disconnected** — Swarm infrastructure exists but isn't wired into main agent loop | `src/swarm/orchestration/ColonyManager.ts` | P2 |
| M7 | **No spawn_agent tool narration** — When spawning a sub-agent, no user-facing narration of what/why | `src/agent/loop.ts` | P1 |

### 1.3 Tool Calling Issues

| # | Issue | Location | Severity |
|---|-------|----------|----------|
| T1 | **No tool classification for narration** — Can't distinguish file ops vs git vs search vs agent spawn | `src/tools/index.ts` | P0 |
| T2 | **No structured narration output** — Tool results are raw text dumps; no "Key findings:", "Changes:", "Errors:" sections | `src/tools/index.ts:43-65` | P1 |
| T3 | **`onProgress` callback unused in main loop** — `spawnAgent` has `onProgress` but loop.ts doesn't pass it through | `src/agent/loop.ts` | P1 |
| T4 | **No tool call intent narration** — User sees "Executing bash" with no context about WHY | `src/agent/tool-execution.ts:87` | P1 |
| T5 | **Parallel tool calls not narrated coherently** — `Promise.all` in `executeAllTools` fires all at once; user sees chaotic output | `src/agent/tool-execution.ts:152-156` | P1 |
| T6 | **No "tool succeeded" / "tool failed" distinction in output** — Both go to same `onTool` callback | `src/agent/tool-execution.ts` | P1 |

---

## 2. ARCHITECTURE

### 2.1 New Module: `src/agent/narration.ts` (Create)

```
src/agent/narration.ts
├── NarrationEvent types (begin_tool, end_tool, begin_agent, end_agent, finding, error, result)
├── NarrationRenderer class
│   ├── render(event: NarrationEvent): string
│   ├── renderToolBox(name, input, elapsedMs, intent?): string
│   ├── renderAgentBox(type, task, phase): string
│   ├── renderFinding(summary, detail): string
│   └── renderResult(what, soWhat): string
├── buildToolIntent(toolName, input): string (WHY narration)
├── classifyToolCall(name): 'file' | 'git' | 'search' | 'web' | 'agent' | 'shell' | 'memory' | 'deploy'
└── formatToolResult(name, result, isError): string (structured output)
```

### 2.2 Updated `src/agent/spawn-agent.ts`

```
Changes:
├── Export SpawnAgentResult interface with structured fields
│   ├── agentId, type, task, output, findings[], errors[], durationMs, success
├── Add findAgent(), planAgent(), verifyAgent(), codeAgent(), researchAgent() shortcuts
├── Expose onProgress callbacks properly (not just internally)
├── Add summarizeForParent(findings): string helper
├── Export SPAWN_AGENT_DEFINITION (already exists)
└── Add parallel orchestration option for orchestrateTask()
```

### 2.3 Updated `src/agent/tool-execution.ts`

```
Changes:
├── Import NarrationRenderer from narration.ts
├── Add onFinding callback: (finding: string) => void
├── Add onPhase callback: (phase: string) => void
├── Structured ToolResultBlock with metadata
│   ├── toolName, toolInput, success, error?, output, durationMs
├── Tool call classification via classifyToolCall()
├── Intent narration before execution
└── Parallel tool calls get sequential narration (not all at once)
```

### 2.4 Updated `src/agent/loop.ts`

```
Changes:
├── Import NarrationRenderer
├── Add onFinding, onPhase callback params (optional)
├── Pass callbacks through to executeAllTools
├── Narrate tool call intent BEFORE calling onTool
├── Narrate agent phase transitions (begin_agent, end_agent)
├── Narrate findings from sub-agents
└── Build structured trace context from NarrationEvent[]
```

### 2.5 Updated `src/repl/index.ts`

```
Changes:
├── Import NarrationRenderer
├── Add onFinding, onPhase handlers to REPL
├── Show structured narration in terminal
├── Spinner + narration don't conflict
└── Handle multi-line narration gracefully
```

---

## 3. IMPLEMENTATION CHECKLIST

### Phase 1: Narration Infrastructure (P0)

- [ ] Create `src/agent/narration.ts`
- [ ] Define `NarrationEvent` union type
- [ ] Implement `NarrationRenderer` class
- [ ] Implement `buildToolIntent()` for WHY narration
- [ ] Implement `classifyToolCall()` for categorization
- [ ] Implement `formatToolResult()` for structured output
- [ ] Add `onFinding` and `onPhase` callbacks to `executeAllTools`
- [ ] Add structured narration BEFORE each tool call in loop

### Phase 2: Multi-Agent Enhancement (P0)

- [ ] Export `SpawnAgentResult` interface from `spawn-agent.ts`
- [ ] Add structured findAgent/planAgent/verifyAgent/codeAgent/researchAgent exports
- [ ] Implement `summarizeForParent()` helper
- [ ] Wire `onProgress` into user-visible narration
- [ ] Add parallel orchestration option to `orchestrateTask()`

### Phase 3: Tool Calling Enhancement (P1)

- [ ] Add tool classification metadata to tool definitions
- [ ] Implement structured output sections in tool results
- [ ] Sequential narration for parallel tool calls
- [ ] Success/failure distinction in narration
- [ ] Duration narration (e.g., "took 2.3s")

### Phase 4: Integration & Testing (P1)

- [ ] Update `src/agent/loop.ts` to use narration system
- [ ] Update `src/repl/index.ts` to render narration events
- [ ] Add tests for NarrationRenderer
- [ ] Add tests for tool classification
- [ ] Add integration tests for multi-agent narration

---

## 4. EXPECTED OUTCOMES

### Before (Current)
```
> what do we need to fix the narration and multi agent work?
user input...

[spawn_agent] Using tool: read_file
[spawn_agent] Using tool: glob
[spawn_agent] Using tool: search_files
[spawn_agent] Result:

user input
read_file
glob
search_files
... raw concatenated text output ...
```

### After (Target)
```
> what do we need to fix the narration and multi agent work?

[EXPLORE] Reading project files to understand current state...
  ├─ read_file /root/dirgha-ai/apps/dirgha-cli/src/agent/loop.ts
  ├─ glob **/*.ts
  └─ search_files narration, tool_call, multi-agent

[EXPLORE] Key findings:
  • 3 critical narration issues identified
  • Multi-agent system needs structured output
  • Tool calling lacks classification

[CODE] Implementing narration infrastructure...
  ├─ write_file src/agent/narration.ts
  ├─ edit_file src/agent/spawn-agent.ts
  └─ edit_file src/agent/loop.ts

[VERIFY] Testing changes...
  ✓ NarrationRenderer tests pass
  ✓ Tool classification tests pass

Done. 3 files modified.
```

---

## 5. FILES TO CREATE/MODIFY

### New Files
- `src/agent/narration.ts` — Core narration system

### Modified Files
- `src/agent/spawn-agent.ts` — Structured results + helper exports
- `src/agent/tool-execution.ts` — Callbacks + structured blocks
- `src/agent/loop.ts` — Integration with narration system
- `src/repl/index.ts` — Terminal rendering of narration
- `src/types.ts` — Add NarrationEvent types

### Test Files
- `src/__tests__/narration.test.ts` — New test suite

---

## 6. TECHNICAL NOTES

### Narration Discipline (from system prompt)
The implementation must follow:
1. **Never restate** — Don't say "I'll help you fix..." (they just said that)
2. **Call first tool immediately** — No preamble
3. **Stay silent between calls** — User sees tool output directly
4. **Report back tersely** — One or two sentences at end

### Multi-Agent Coordination
- Sub-agents report structured `Finding[]` arrays
- Parent agent summarizes findings into actionable context
- Phase transitions narrated ("Now implementing...", "Verifying...", etc.)

### Tool Classification Taxonomy
```
file     → read_file, write_file, edit_file, delete_file, make_dir
git      → git_status, git_diff, git_log, git_commit, git_push
search   → search_files, glob, list_files, repo_map
web      → web_search, web_fetch, browser
agent    → spawn_agent, orchestrate, memory_graph_*
shell    → bash, run_command
memory   → save_memory, read_memory, write_todos, ask_user
deploy   → deploy_trigger, deploy_status
```

---

## 7. ESTIMATED EFFORT

| Phase | Files | Lines | Time |
|-------|-------|-------|------|
| Phase 1 (Narration Infrastructure) | 2 | ~400 | 2h |
| Phase 2 (Multi-Agent Enhancement) | 2 | ~200 | 1h |
| Phase 3 (Tool Calling Enhancement) | 2 | ~150 | 1h |
| Phase 4 (Integration & Testing) | 3 | ~200 | 1h |
| **Total** | **9** | **~950** | **5h** |
