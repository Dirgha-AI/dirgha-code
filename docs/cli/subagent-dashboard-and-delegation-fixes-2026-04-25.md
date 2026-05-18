# Subagent Dashboard + Delegation Fixes

> Date: 2026-04-25
> Components: `SubagentDashboard.tsx`, `SubagentDelegator`, `task` tool
> Files: `src/tui/ink/components/SubagentDashboard.tsx`, `src/subagents/delegator.ts`, `src/tools/task.ts`

## Problem

The `task` tool (sub-agent delegation) was not reliably usable. When called, it returned
empty output silently. Three root causes:

1. **DEFAULT_SUBAGENT_TOOLS had wrong tool names** — every entry in the allowlist was
   a dead string that matched zero registered tools. `read_file` should be `fs_read`,
   `write_file` → `fs_write`, `edit_file` → `fs_edit`, `hover` → `hover_documentation`,
   `list_symbols` → `document_symbols`, `git_read` → `git`. A sub-agent with default
   tools could not read, write, or edit files.

2. **Delegator used a single hard-wired Provider** — `DelegatorOptions` took a single
   resolved `Provider` instance. When a task requested a different model (e.g.
   `deepseek-v4-pro` while the parent used Anthropic), the model string was passed to
   the wrong provider and silently failed.

3. **Silent error propagation** — when the agent loop errored with no assistant
   messages, the task tool returned `"(sub-agent produced no output)"` with zero
   diagnostic information.

## Fixes Applied

### 1. Tool name correction (`src/subagents/delegator.ts:35-38`)

```diff
- 'read_file', 'write_file', 'edit_file', 'search_grep', 'search_glob',
- 'shell', 'browser', 'go_to_definition', 'find_references', 'hover',
- 'list_symbols', 'git_read', 'task',
+ 'fs_read', 'fs_write', 'fs_edit', 'search_grep', 'search_glob',
+ 'shell', 'browser', 'go_to_definition', 'find_references', 'hover_documentation',
+ 'document_symbols', 'git', 'task', 'rtk',
```

Added `rtk` (read-only shell with ANSI stripping) and `document_symbols` which
were missing from the defaults.

### 2. Provider routing (`src/subagents/delegator.ts:58-68`)

Replaced `provider: Provider` (single resolved instance) with
`providers?: ProviderRegistry` (model-aware routing). Inside `delegate()`:

```
const resolvedModel = req.model ?? this.opts.defaultModel;
const provider = this.opts.providers.forModel(resolvedModel);
```

This lets the sub-agent use any model the parent's registry can route to.
Backward compat via optional `provider` field for callers that already have a
resolved instance (e.g. `/spawn` slash command).

Updated 5 call sites across `main.ts`, `interactive.ts`, `ask.ts`, `verify.ts`.

### 3. Error propagation (`src/subagents/delegator.ts:147-158`)

When the agent loop errors with no assistant message, the last tool result error
is now extracted and returned in the output:

```
output = "[sub-agent error] Tool "X" is not registered. 35 tools available."
```

## SubagentDashboard (`src/tui/ink/components/SubagentDashboard.tsx`)

New Ink component that tracks the full sub-agent lifecycle from the parent event
stream:

| Lifecycle phase | Event listened to | UI state |
|---|---|---|
| LLM decides to delegate | `toolcall_start` (name=task) | Pending ○ |
| Prompt captured | `toolcall_delta` + `toolcall_end` | Label shows first 48 chars |
| Execution started | `tool_exec_start` (name=task) | Running ● |
| Execution complete | `tool_exec_end` | Completed ✓ or error ✗ |
| Duration + output | `tool_exec_end.durationMs/output` | Seconds + preview line |

Handles race conditions (e.g. `tool_exec_start` arriving before `toolcall_start`).
Uses semantic palette keys (`palette.text.secondary`, `palette.status.success`,
`palette.status.error`). Rendered alongside existing `SubagentPanel` — both
coexist, dashboard is scope-limited to sub-agents only (not fleet agents).

## Verification

- TypeScript: `tsc --noEmit` passes with zero errors
- Tests: all 466 tests pass (40 test files)
- Live: `dirgha ask` with task tool successfully delegates shell commands and
  returns output
- Model routing: `task(..., model="deepseek-chat")` routes to DeepSeek provider
  correctly even when parent uses a different model
- Error propagation: calling a non-existent tool returns
  `"Tool "X" is not registered. 35 tools available."`
