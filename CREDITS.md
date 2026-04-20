# Credits

Dirgha Code is built on the shoulders of giants.

## Direct inspirations

- **[CLI-Anything](https://github.com/HKUDS/CLI-Anything)** (HKU Data Science) — the `SKILL.md` manifest and universal `--json` contract that shaped Dirgha's agent-native story.
- **[Hermes Agent](https://github.com/nousresearch/hermes-agent)** (Nous Research) — modal overlay UX, paste-collapse, `/verbose` cycle.
- **[OpenAI Codex CLI](https://github.com/openai/codex)** — paste-burst detector, shimmer on in-flight cells, tool-output cap with transcript escape.
- **[OpenCode (sst fork)](https://github.com/sst/opencode)** — chronological stream-render pattern, two-row input box. (The earlier `opencode-ai/opencode` is archived; `sst/opencode` is the active fork.)
- **[Claude Code](https://claude.com/claude-code)** (Anthropic) — behavioural reference for what an agent TUI can feel like.

## Multi-agent + worktree patterns

- **[agent-worktree](https://github.com/nekocode/agent-worktree)** — snap-mode lifecycle (`create → run → prompt → merge`).
- **[multica](https://github.com/multica-ai/multica)** — Runtime abstraction (Local / Worktree / SSH).
- **[coder/mux](https://github.com/coder/mux)** — three-runtime selector UI, opportunistic compaction.
- **[ccpm](https://github.com/automazeio/ccpm)** — stream decomposition + GitHub Issues as durable state.
- **[claudio](https://github.com/Iron-Ham/claudio)** — TripleShot + adversarial judge.
- **[genie](https://github.com/automagik-dev/genie)** — `/brainstorm → /wish → /work → /review` lifecycle.
- **[maw](https://github.com/boxabirds/maw)** — transient-commit 3-way apply-back.
- **[citadel](https://github.com/SethGammon/Citadel)** — four-tier intent router, fleet campaign resume.
- **[devteam](https://github.com/agent-era/devteam)** — Ink TUI with diff-review + comment reinjection.

## Stack

Dirgha Code runs on top of:

- **[commander](https://github.com/tj/commander.js)** — CLI argument parsing
- **[Ink](https://github.com/vadimdemedes/ink)** + **[React](https://react.dev)** — terminal UI
- **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)** — session persistence
- **[esbuild](https://esbuild.github.io)** — single-bundle distribution

## The name

*Dirgha* (दीर्घ) is Sanskrit for *long* / *enduring*. The project aims to be
durable software — built once, owned forever, forkable, sovereign.

## Thanks

Every open-source maintainer whose library Dirgha Code depends on. Every
person who reported a bug or suggested a better word. Every engineer who
has ever shared their tool-call rendering trick in a Twitter thread.

Want to be listed here for a meaningful contribution? See
[CONTRIBUTING.md](./CONTRIBUTING.md).
