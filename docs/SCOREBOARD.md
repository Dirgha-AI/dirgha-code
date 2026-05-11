# CLI Agent Feature Scoreboard

Comparing **Dirgha CLI** vs **Gemini CLI** (Google), **Claude Code** (Anthropic), **Codex CLI** (OpenAI).

## Feature Categories

### 1. Agent Loop & Provider Support

| Feature | Dirgha CLI | Gemini CLI | Claude Code | Codex CLI |
|---------|-----------|------------|-------------|-----------|
| Multiple providers | ✅ 17 providers | ❌ Gemini-only | ❌ Claude-only | ❌ OpenAI-only |
| BYOK (bring your own key) | ✅ ~/keys.json | ❌ | ❌ | ❌ |
| Local models (llama.cpp) | ✅ Ollama + llama.cpp | ❌ | ❌ | ❌ |
| Tool calling | ✅ ReAct loop | ✅ | ✅ | ✅ |
| Streaming responses | ✅ | ✅ | ✅ | ✅ |
| Context compaction | ✅ auto-compact on overflow | ✅ auto (Gemini 1M context) | ✅ auto | ✅ auto |
| Failover models | ✅ | ❌ | ❌ | ❌ |
| Error classification | ✅ rate-limit/5xx/timeout | ✅ | ✅ | ✅ |

### 2. Tool System

| Feature | Dirgha CLI | Gemini CLI | Claude Code | Codex CLI |
|---------|-----------|------------|-------------|-----------|
| File read/write/edit | ✅ | ✅ | ✅ | ✅ |
| Shell execution | ✅ | ✅ | ✅ | ✅ |
| Search (grep/glob) | ✅ rtk + grep + glob | ✅ | ✅ | ✅ |
| Web fetch | ✅ browser tool | ✅ web_fetch | ❌ | ❌ |
| GitHub integration | ✅ github tool | ✅ | ❌ | ✅ |
| MCP support | ✅ stdio + HTTP | ✅ MCP client | ✅ | ✅ |
| Git operations | ✅ git tool | ✅ | ✅ | ✅ |
| Task management | ✅ task_create/update/list | ❌ | ❌ (cron only) | ❌ |
| File watching | ❌ | ❌ | ❌ | ❌ |
| Image input | ✅ | ✅ | ❌ | ❌ |

### 3. TUI / User Experience

| Feature | Dirgha CLI | Gemini CLI | Claude Code | Codex CLI |
|---------|-----------|------------|-------------|-----------|
| Streaming markdown | ✅ | ✅ | ✅ | ✅ |
| Syntax-highlighted code | ✅ | ✅ | ✅ | ✅ |
| Inline diffs | ✅ | ✅ | ✅ | ✅ |
| Theme support | ✅ 6 themes | ✅ | ❌ | ❌ |
| Vim mode | ✅ | ❌ | ❌ | ❌ |
| Status bar | ✅ model/tokens/duration | ✅ | ✅ | ✅ |
| Prompt queue indicator | ✅ | ❌ | ✅ (sub-agent panel) | ✅ |
| Task/todo panel | ✅ TaskIndicator | ❌ | ❌ | ❌ |
| Sub-agent running panel | ✅ SubagentPanel | ❌ | ✅ running tab | ✅ /agent |
| Help overlay | ✅ /help | ✅ /help | ❌ | ✅ |
| Model picker | ✅ interactive | ✅ | ❌ | ✅ |

### 4. Session & Persistence

| Feature | Dirgha CLI | Gemini CLI | Claude Code | Codex CLI |
|---------|-----------|------------|-------------|-----------|
| Session persistence | ✅ ~/.dirgha/sessions/*.jsonl | ✅ ~/.gemini/history/ | ✅ --resume | ✅ ~/.codex/sessions/ |
| Memory/notes | ✅ ~/.dirgha/memory/*.md | ✅ GEMINI.md | ✅ MEMORY.md | ✅ AGENTS.md |
| Ledger/decisions | ✅ ~/.dirgha/ledger/*.jsonl | ❌ | ❌ | ❌ |
| Checkpoints | ✅ save/restore/list | ✅ /checkpoint | ✅ --resume | ✅ |
| Cron/scheduling | ✅ cron tool | ❌ | ✅ /loop | ✅ Automations |
| Audit log | ✅ | ❌ | ❌ | ✅ |

### 5. Parallel Execution

| Feature | Dirgha CLI | Gemini CLI | Claude Code | Codex CLI |
|---------|-----------|------------|-------------|-----------|
| Sub-agents | ✅ task tool + pool | ❌ | ✅ subagents | ✅ /fork |
| Fleet (git worktrees) | ✅ fleet command | ❌ | ❌ | ❌ |
| DAG task execution | ✅ platform CLI | ❌ | ❌ | ❌ |
| Parallel bounded pool | ✅ max 3 concurrent | ❌ | ✅ | ✅ |

### 6. Developer Experience

| Feature | Dirgha CLI | Gemini CLI | Claude Code | Codex CLI |
|---------|-----------|------------|-------------|-----------|
| Multiple models per provider | ✅ 300+ models | ❌ | ❌ | ❌ |
| Auto update | ✅ /update | ✅ | ✅ | ✅ |
| Doctor/diagnostics | ✅ dirgha doctor | ✅ | ❌ | ✅ |
| Status overview | ✅ dirgha status | ✅ | ❌ | ✅ |
| Usage stats | ✅ dirgha stats | ✅ | ❌ | ✅ |
| Non-interactive mode | ✅ --print, --json | ✅ -p | ✅ | ✅ |
| Scriptable | ✅ stdin pipe | ✅ pipe | ✅ | ✅ |
| Verification/QA | ✅ ask + verify | ❌ | ❌ | ❌ |
| Scaffold projects | ✅ scaffold command | ❌ | ❌ | ✅ |

### 7. Security & Safety

| Feature | Dirgha CLI | Gemini CLI | Claude Code | Codex CLI |
|---------|-----------|------------|-------------|-----------|
| Tool approval | ✅ approval bus | ✅ default mode | ✅ default | ✅ |
| Auto-approve allowlist | ✅ configurable | ✅ --allowed-tools | ✅ | ✅ |
| YOLO mode | ✅ | ✅ --yolo | ❌ | ✅ |
| Sandbox execution | ✅ sandbox mode | ✅ Docker sandbox | ❌ | ✅ |
| Prompt injection detection | ✅ | ❌ | ❌ | ❌ |

---

## Score Summary

| Category | Dirgha CLI | Gemini CLI | Claude Code | Codex CLI |
|----------|-----------|------------|-------------|-----------|
| Provider Support | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ |
| Tool System | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| TUI/UX | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Session/Persistence | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Parallel Execution | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Developer Experience | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Security & Safety | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

## Gaps vs Gemini CLI (highest-priority)

| Gap | Dirgha Status | Gemini CLI Approach |
|-----|--------------|-------------------|
| MCP support | ✅ stdio + HTTP | Built-in MCP client/server |
| File watching | ❌ missing | Not needed (1M context) |
| Google Search grounding | ❌ missing | Built-in tool |
| /chat save/resume | ⚠️ partial | Named checkpoints |
| Token caching | ❌ missing | Built-in (1M context) |
| IDE companion | ❌ missing | VS Code extension |
