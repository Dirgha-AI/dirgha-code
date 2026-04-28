# dirgha-cli core

Source for the @dirgha/code CLI agent. Specs at `../docs/dirgha-code/2026-04-23/`.

## Layout

- **L0 Kernel** — `kernel/`: agent loop (ReAct + plan-execute hybrid), typed event stream, message assembly.
- **L1 Providers** — `providers/`: one HTTP helper owns SSE headers; adapters for NVIDIA NIM, OpenRouter, OpenAI, Anthropic, Google Gemini, Ollama, and the deprecated Fireworks path. The canonical streaming implementation makes the prior NVIDIA stutter structurally impossible.
- **L2 Tools** — `tools/`: registry + executor + permission seam + eight built-in tools (fs_read, fs_write, fs_edit, fs_ls, shell, search_grep, search_glob, git).
- **L3 Context** — `context/`: compaction, branching, memory.
- **L4 Skills/MCP** — `skills/`, `mcp/`: skill loader, MCP client, subagents, hooks.
- **L5 TUI** — `tui/ink/`: Ink-based differential TUI; daemon and ACP server live alongside.
- **L6 Policy** — `audit/`: approval bus, sandbox adapters, append-only audit log.
- **L7 Routing** — smart router, error classifier, cost tracker (split across `providers/dispatch.ts`, `kernel/`, `web/cost.ts`).
- **L8 Distribution** — parity harness, eval harness, npm distribution (under `scripts/qa-app/` at the repo root).

## Build

```bash
npm run build      # tsc → dist/
npm test           # vitest src
npm run test:cli   # full integration sweep
```

## Module-size discipline

Every file targets ≤500 LOC, ceiling 800 LOC. When a file crosses 500, open a new module rather than growing the existing one.

## Provider environment

- `NVIDIA_API_KEY` — NVIDIA NIM models
- `OPENROUTER_API_KEY` — OpenRouter models (includes Ling free tier)
- `ANTHROPIC_API_KEY` — native Messages API
- `OPENAI_API_KEY` — native /chat/completions
- `GEMINI_API_KEY` / `GOOGLE_API_KEY` — Google AI
- `DIRGHA_MODEL` — default model id
