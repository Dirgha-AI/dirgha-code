# dirgha-cli core (v2 rebuild)

Layered rewrite of the CLI core. Specs at `../../docs/dirgha-code/2026-04-23/`.

## What's landed (sprints 0–3)

- **L0 Kernel** — `kernel/`: agent loop (ReAct + plan-execute hybrid), typed event stream, message assembly.
- **L1 Providers** — `providers/`: one HTTP helper owns SSE headers; adapters for NVIDIA NIM, OpenRouter, OpenAI, Anthropic, Google Gemini, Ollama, and the deprecated Fireworks path. The canonical streaming implementation makes the prior NVIDIA stutter structurally impossible.
- **L2 Tools** — `tools/`: registry + executor + permission seam + eight built-in tools (fs_read, fs_write, fs_edit, fs_ls, shell, search_grep, search_glob, git).

## What's next (sprints 4–16)

See `SPRINTS.md` in the spec package.

- Context, compaction, branching, memory (L3)
- Skills, MCP client, subagents, hooks (L4)
- Differential TUI, daemon, ACP server (L5)
- Policy engine, approval bus, sandbox adapters, audit log (L6)
- Smart router, error classifier, cost tracker (L7)
- Parity harness, eval harness, npm distribution (L8)
- Bucky + Arniko + Deploy integration clients
- Cutover from legacy `src/` to `src_v2/`

## Build

```bash
npm run build:v2            # tsc → dist_v2/
npm run test:v2             # vitest src_v2
npm run v2 -- --help        # invoke v2 binary
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
