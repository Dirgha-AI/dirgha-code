# Dirgha CLI — Launch & Competitive Game Plan

## The Landscape

| Tool | Stars | Language | Providers | Local? | Price |
|------|-------|----------|-----------|--------|-------|
| **Claude Code** | ~50k | TypeScript | Anthropic only | ❌ | $20/mo Claude Pro |
| **Codex CLI** | 81.8k | Rust | OpenAI only | ❌ | $20/mo ChatGPT Plus |
| **Gemini CLI** | 104k | TypeScript | Google only | ❌ | Free tier (60 req/min) |
| **Dirgha CLI** | **0** | TypeScript | **17 providers** | ✅ **Ollama/llama.cpp** | **$0 (BYOK)** or $20/mo |

## The Asymmetric Advantage

We can't out-spend OpenAI (81.8k stars, 6,377 commits, OpenAI marketing).
We CAN out-maneuver them.

**Dirgha's superpowers (none of the big 3 have all of these):**

```
✅ 17 providers              ✅ BYOK (any key, any model)
✅ Local LLMs (Ollama)       ✅ Image gen (NVIDIA SD3 free)
✅ Voice (TTS + STT)         ✅ Task system (persistent TUI)
✅ Fleet (parallel agents)   ✅ Bio/CAD/Voice agent server
✅ 343 tests                 ✅ MCP support (stdio + HTTP)
✅ Sub-agents + pool         ✅ Auto-compaction on overflow
✅ Paste protection          ✅ Session resume
```

## Phase 1 — Ship Shape (Week 1)

### Day 1-2: README & Repo Polish

```
Action items:
  [ ] Write compelling README with hero image + demo GIF
  [ ] Add CI badges: tests, npm version, license
  [ ] Add CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md
  [ ] Create docs/ directory with getting-started guide
  [ ] Add `AGENTS.md` auto-discovery support
```

**AGENTS.md is critical.** Claude Code, Gemini CLI, and Codex all have it. When a user runs `dirgha` in a project with `AGENTS.md`, it should be loaded automatically as system context. This is the #1 drop-in replacement feature.

### Day 3-4: Distribution

```
Action items:
  [ ] Publish to Homebrew: brew install dirgha
  [ ] Publish to npm: npm install -g @dirgha/code (ALREADY DONE ✅)
  [ ] Create Docker image: docker run dirgha/code
  [ ] Add auto-update check on startup
  [ ] GitHub Actions CI badge showing 343 tests ✅ passing
```

### Day 5-7: Social Proof

```
Action items:
  [ ] Star the repo (dogfood)
  [ ] Post to Hacker News: "Dirgha CLI — 17 providers, BYOK, local models"
  [ ] Post to r/programming, r/MachineLearning
  [ ] Create a demo video (60s screen recording)
  [ ] Tweet thread comparing benchmarks
```

## Phase 2 — Feature Parity (Week 2-3)

### Must-have for serious player status:

```
Priority 1 — AGENTS.md support (already half-done via DIRGHA.md)
  [ ] Agent reads ~/.dirgha/AGENTS.md + <project>/.dirgha/AGENTS.md on startup
  [ ] Injects as system prompt prefix
  [ ] Same format as Claude Code/Codex so it's a drop-in replacement

Priority 2 — Homebrew formula
  [ ] Submit to homebrew-core
  [ ] brew install dirgha

Priority 3 — VS Code Extension (optional, high visibility)
  [ ] Chat panel in sidebar
  [ ] Inline diffs for file edits
  [ ] Publish to VS Code marketplace

Priority 4 — Desktop App (optional, Codex parity)
  [ ] Tauri-based desktop wrapper
  [ ] Review panel with accept/reject diffs
  [ ] Session history browser
```

## Phase 3 — Moats (Week 4+)

### Things none of the big 3 have:

```
Dirgha-exclusive features:
  [ ] Multi-provider routing — auto-pick cheapest working model
  [ ] Local-first mode — works 100% offline with Ollama
  [ ] Image generation in CLI — nvidia-sd3-medium (free)
  [ ] Voice commands in CLI — dirgha voice (free via Groq)
  [ ] Task system — persistent ~/.dirgha/tasks.json with TUI panel
  [ ] Bio/CAD agent server — Python tools for science & engineering

Community:
  [ ] Skills/plugin marketplace (MCP-based)
  [ ] Open-collective for funding
  [ ] GitHub sponsors
```

## The Pitch

```
Dirgha CLI — The anti-Codex.

Use any model from any provider. Bring your own keys. Keep your data local.
Codex locks you into OpenAI. Dirgha works with 17 providers and 300+ models.

  npm install -g @dirgha/code
  dirgha

  • 17 providers — Anthropic, Google, DeepSeek, Groq, OpenAI, local models
  • BYOK — use your existing API keys, no subscription required
  • Local LLMs — Ollama, llama.cpp, run entirely offline
  • 30+ built-in tools — file ops, shell, git, GitHub, browser, MCP, tasks
  • Voice commands — speak to your terminal, TTS reads responses
  • Image generation — NVIDIA SD3 (free), no GPU needed
  • Task system — persistent todos with progress bars in the TUI
  • Fleet — parallel agents in git worktrees
  • MCP support — connect any MCP server for custom tools
  • 343 tests passing — CI/CD pipeline with npm publish

  $0 with BYOK. $20/mo with managed billing.
```

## Launch Checklist (T-0)

```
[  ] README with hero image, badges, quickstart
[  ] AGENTS.md support (drop-in Claude Code replacement)
[  ] Homebrew formula submitted
[  ] npm package published (DONE — v1.25.9)
[  ] CI tests passing badge: 343 ✅
[  ] Demo GIF in README (asciinema recording)
[  ] Hacker News post drafted
[  ] Reddit post drafted (r/programming, r/MachineLearning)
[  ] Tweet thread drafted
[  ] GitHub Discussions enabled
[  ] CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md
```

## Quick Wins (do right now, under 1 hour)

1. **AGENTS.md support** — ~50 lines of code. Read `<project>/AGENTS.md` on startup, inject as system context. Makes Dirgha a drop-in replacement for Claude Code in any project that already has AGENTS.md.

2. **README rewrite** — 30 minutes. Copy the pitch above, add badges, add asciinema demo GIF.

3. **GitHub Actions badge** — 5 minutes. Add `![tests](https://github.com/Dirgha-AI/dirgha-code/actions/workflows/ci.yml/badge.svg)` to README.

4. **Homebrew formula** — ~50 lines of Ruby. Copy the Codex formula, change URLs.

Want me to start on the quick wins right now?
