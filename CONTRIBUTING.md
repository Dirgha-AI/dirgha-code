# Contributing to Dirgha Code

Thanks for wanting to help make Dirgha Code better. This page covers everything from "I've never opened a PR" to "I'm shipping a new provider integration."

If you're new here, jump to [Beginner's guide](#beginners-guide-what-can-i-actually-do).
If you're checking the rules, jump to [Before your first PR](#before-your-first-pr).
If a term is confusing, jump to the [Glossary](#glossary).

---

## Beginner's guide — what can I actually do?

Dirgha Code is a CLI coding agent. You install it (`npm install -g @dirgha/code`), bring your own API key for any of [17 LLM providers](#supported-providers), type `dirgha` in a terminal, and an AI pair-programmer takes over. It can read your files, run shell commands, write/edit code, search the web (via Perplexity), and chain tools together to finish multi-step tasks.

Common ways people use it:

- **Daily coding partner** — `dirgha "fix the failing test in authService"` and it edits the file, runs the test, iterates until green.
- **Repo onboarding** — clone an unfamiliar codebase, run `dirgha "explain the architecture"` and it reads `README.md`, walks the directory tree, and summarises.
- **Long-horizon refactors** — kick off `dirgha "migrate every callbacks.then() in src/ to async/await, one file per turn, run tests after each"` and let it work for a while.
- **Cost-aware prototyping** — set `DIRGHA_PROVIDER=openrouter -m tencent/hy3-preview:free` for free-tier development; switch to `claude-sonnet-4-6` when you need the reasoning.
- **Local-only privacy mode** — point it at Ollama or llama.cpp; nothing leaves your machine.
- **Parallel agents** — `dirgha fleet launch ...` runs N independent agents in git worktrees so you can branch a task four ways at once.
- **Persistent memory** — `dirgha memory add user "I prefer 2-space indentation"` and the next session picks it up.

Things you can contribute, ordered easiest → hardest:

### 🟢 Beginner-friendly (good first PRs)

- **Fix a typo or unclear copy** in `--help`, doctor output, or any in-CLI string. Grep for the text, change it, open a PR — that's it.
- **Add a theme.** New entry in `src/tui/theme.ts` `PALETTES` map. Pick colours that meet WCAG AA contrast (≥ 4.5:1 for body text on background). Test with `/theme <yourname>` after `npm run build`.
- **Add a built-in slash command.** Drop a new file in `src/cli/slash/<your-command>.ts` exporting a `SlashCommand` object, then add it to the array in `src/cli/slash/index.ts`. The `/clear` command (`src/cli/slash/clear.ts`) is the smallest example — under 20 lines.
- **Add a new model to the catalogue.** Append a row to `PRICES` in `src/intelligence/prices.ts` with `provider`, `model`, `inputPerM`, `outputPerM`, `contextWindow`. The picker shows it on next start.
- **Write a doctor check.** New `CheckResult`-returning function in `src/cli/subcommands/doctor.ts`, push to the `results` array. Good for things like "is `gh` installed?", "does the `~/.dirgha/keys.json` have correct permissions?", "is the system clock skewed?".

### 🟡 Intermediate

- **Add a tool.** New file in `src/tools/<name>.ts` exporting a `Tool` object (`name`, `description`, `inputSchema`, `execute()`). Register in `src/tools/registry.ts`. Tools the agent can call should describe themselves precisely — the description is what the model reads.
- **Add a provider.** Use `defineOpenAICompatProvider` from `src/providers/define-openai-compat.ts` for any OpenAI-compatible API (most are). Three new lines in `extra-providers.ts` + a routing rule in `dispatch.ts` + a row in `setup.ts`'s `BYOK_KEYS` list. Full recipe lives in `src/skills/add-provider.md` — type `/provider add <name>` and the agent follows it for you.
- **Improve a TUI component.** `src/tui/ink/components/` — every overlay and message bubble is its own file. Use ink primitives (`<Box>`, `<Text>`, `useInput`). Read [the Ink docs](https://github.com/vadimdemedes/ink) first if you haven't.
- **Add a skill.** `src/skills/<your-skill>.md` — markdown with frontmatter. The agent reads available skills and invokes the matching one when the user's request matches the description. See `add-provider.md` as a template.
- **Add a subcommand.** New file in `src/cli/subcommands/<name>.ts` exporting a `Subcommand`, register in `src/cli/subcommands/index.ts`. Subcommands run before the interactive REPL kicks in (e.g., `dirgha doctor`, `dirgha keys list`).

### 🔴 Advanced

- **Kernel / agent-loop changes.** `src/kernel/agent-loop.ts` is the ReAct loop — every change here affects every model + every tool. Discuss in an issue first.
- **Compaction strategy.** `src/context/compaction.ts` decides what context to drop when the window fills. Tradeoffs are subtle (preserve recent turns? structured-summary tool calls? semantic dedup?).
- **New rendering surfaces.** Sticky scroll panes, alternate-buffer scroll viewers, mouse selection, image rendering — nontrivial because of how Ink's differential renderer interacts with raw mode.
- **Cross-platform input handling.** Windows console keypress quirks, macOS Option+Backspace, etc. Touchy because every fix has to land in five terminals.

### Don't know where to start?

`dirgha skills` (or look at `src/skills/`) lists every skill the agent can invoke. Pick one and improve it. `dirgha doctor` shows what's wrong on your machine — fix any check that's `warn` or `fail`.

You can also just ask: open an issue with "what should I work on?" and we'll suggest something based on what's in the [What's NOT done](#whats-not-done) section of the canonical state doc.

---

## Before your first PR

1. **Read the [CLA](CLA.md).** Every contributor signs it. Contributions are assigned to Dirgha LLC so we can keep the project coherent and relicensable as the product grows. This is standard for a commercial open-source project. If you're contributing for a company, make sure you have authority to sign on its behalf.

2. **Sign the CLA.** Open your PR with this line in the description:

   > I have read and agree to the Dirgha AI Contributor License Agreement at CLA.md, and I submit this Contribution under those terms.

   That's it — no external forms, no DocuSign. We'll record your name in `CONTRIBUTORS.md` on merge.

3. **Read the [LICENSE](LICENSE).** Dirgha Code is released under the Functional Source License 1.1 (MIT Future License). Your contributions inherit that license and will convert to MIT two years after the release they ship in.

---

## How to contribute

### Bugs and feature requests

Open an issue. Include:
- What you expected
- What actually happened
- Reproduction steps, OS, Node version, Dirgha version (`dirgha --version`)
- Relevant output from `DIRGHA_DEBUG=1 dirgha ...` if it's a runtime bug
- `dirgha doctor` output — paste the table

### Pull requests

- Branch from `main`
- Keep changes focused — one PR per concern
- Run `npm test` before pushing
- Run `npm run lint` (`tsc --noEmit`) — the build must type-check with zero warnings
- Include a short description of what the change does and why
- Reference the issue number if there is one (`Fixes #123`)
- Conventional-commit prefix on the title:
  - `fix:` — bug fix → patch bump
  - `feat:` — new feature → minor bump
  - `docs:`, `chore:`, `refactor:`, `test:` — no version bump
  - `feat!:` or `BREAKING CHANGE:` in body → major bump

### Code style

- TypeScript strict mode
- No new dependencies without justification in the PR description
- No emoji in code unless explicitly requested
- Comments explain **why**, not **what** — well-named code documents itself
- Don't add error handling for scenarios that can't happen
- Default to fewer abstractions, not more
- Files ≤ 200 lines is a target, not a hard rule
- Lint budget is **0 warnings** — `npm run lint` must pass clean

---

## Scope — what belongs here

**Belongs in `@dirgha/code`:**
- Terminal UI improvements
- LLM provider integrations (new providers, streaming, tool calling)
- Agent-mode headless command surface
- CLI plugin infrastructure
- Tools (read/write/edit/search/shell/git/browser)
- Performance, reliability, stability
- Cross-platform fixes (Windows / macOS / Linux)

**Does not belong here:**
- Billing, quota enforcement, user management — those live in the Dirgha Gateway (not open source)
- Web/mobile UI — separate repos
- Model weights — those are upstream at the provider

---

## Releases

Maintainers handle publishing. We follow [semantic versioning](https://semver.org/) strictly, and [release-please](https://github.com/googleapis/release-please) auto-bumps based on conventional-commit prefixes:

- **PATCH** (`1.5.1 → 1.5.2`) — bug fixes, copy tweaks, internal refactors, dependency bumps. No user-visible behavior change.
- **MINOR** (`1.5.x → 1.6.0`) — new commands, new flags, new features. Existing flows continue to work the same.
- **MAJOR** (`1.x → 2.0`) — a CLI contract changed: a flag renamed, a command removed, a config-file shape altered, or a default behavior changed in a way that could surprise an existing user.

If your PR doesn't add a new user-facing capability, it's a patch.

---

## Supported providers

As of v1.12.2, Dirgha Code routes to **17 providers** out of the box. You only need keys for the ones you want to use.

| Provider | Env var | Best for |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | Claude Opus / Sonnet / Haiku — strongest reasoning |
| OpenAI | `OPENAI_API_KEY` | GPT-5.5 family, o1/o3 |
| Google AI | `GEMINI_API_KEY` | Gemini Pro / Flash, long context |
| OpenRouter | `OPENROUTER_API_KEY` | 370+ models incl. free tier (hy3, ling, gemma, nemotron) |
| NVIDIA NIM | `NVIDIA_API_KEY` | Free tier · Kimi K2.5, DeepSeek V4, Qwen 3, Llama |
| Mistral | `MISTRAL_API_KEY` | Mistral Large, Codestral, Magistral |
| Cohere | `COHERE_API_KEY` | Command R / Command A — RAG-tuned |
| Cerebras | `CEREBRAS_API_KEY` | Wafer-scale inference, very fast |
| Together AI | `TOGETHER_API_KEY` | Open-source model hub — Llama, Qwen, DeepSeek |
| Perplexity | `PERPLEXITY_API_KEY` | Sonar — search-grounded answers |
| xAI (Grok) | `XAI_API_KEY` | Grok 4 family — code + reasoning |
| Groq | `GROQ_API_KEY` | LPU-accelerated · very low latency |
| Z.AI / GLM | `ZAI_API_KEY` | GLM-4.6 — long-context |
| Fireworks | `FIREWORKS_API_KEY` | Hosted open models, fast |
| DeepSeek (native) | `DEEPSEEK_API_KEY` | Direct DeepSeek API — own quota, no shared 429s |
| Ollama (local) | — (URL only) | Privacy-first, no key needed |
| llama.cpp (local) | — (URL only) | Privacy-first, no key needed |

Add a key with `dirgha keys add <ENV_VAR> <key>`. List with `dirgha keys list`. Switch model in-session with `/models`.

---

## Glossary

Plain-English definitions for every term in the codebase, docs, and this guide. Sorted alphabetically.

### Agent loop
The "ReAct" execution model. Dirgha sends the user's prompt + the conversation so far + a list of available tools to the LLM. The LLM responds with either text (final answer) or one or more tool calls. Dirgha runs each tool call, appends the result to the conversation, and loops back. Continues until the LLM produces text-only or `--max-turns` is hit. Lives in `src/kernel/agent-loop.ts`.

### Approval bus
The mechanism that asks the user "do you want me to run this `shell` command?" before a tool executes. Tools mark themselves `requiresApproval: true` (e.g., shell, fs_write, fs_edit). The bus presents a yes/no prompt. Replaced in v1.12.1 with an Ink-native version that fixes a Windows-specific stall. See `src/tui/ink/ink-approval-bus.ts`.

### BYOK (Bring Your Own Key)
You supply API keys for the LLM provider. Dirgha sends your prompts to that provider on your behalf using your key — bills go to your account, not to us. The opposite is "hosted" (single login, we proxy through our gateway with our keys). Dirgha is BYOK by default.

### Catalogue
The list of models Dirgha knows about, with prices, context windows, and tool-call support flags. Lives in `src/intelligence/prices.ts`. The picker reads from it; `dirgha cost` uses prices to compute spend.

### Compaction
When the conversation gets close to the model's context window, Dirgha summarises old turns to free up tokens. Triggered automatically at 75% of the model's window. The summarisation uses `summaryModel` from config. See `src/context/compaction.ts`.

### Context window
The maximum number of tokens (≈ words) a model can read in a single request. Most current models are 128k–256k tokens; some go to 1M (Llama 4 Maverick, grok-4-fast). When you're about to exceed it, compaction kicks in.

### Conventional commits
A commit-message format that lets release-please decide the next version automatically. `feat:` triggers a minor bump, `fix:` a patch, `feat!:` or `BREAKING CHANGE:` a major. The prefix matters; the rest is free-form.

### Dispatch
The function that maps a model id (`claude-sonnet-4-6`, `cohere/command-a-03-2025`, `tencent/hy3-preview:free`) to the provider that handles it (`anthropic`, `cohere`, `openrouter`). Pure function in `src/providers/dispatch.ts`. Adding a new provider is a one-line change here.

### Failover
When a model returns an error that's "fixable by switching" (deprecated id, rate limit, 5xx), Dirgha looks up a known-good substitute from `MODEL_FAILOVERS` in `prices.ts`. The user sees an inline `[y/n/p=picker]` prompt and can accept the swap to retry the failed turn.

### Fleet
A set of agents running in parallel git worktrees, each with its own task. `dirgha fleet launch ...`. Useful for trying four approaches to the same problem and merging the winner. See `src/fleet/`.

### Frontmatter
The YAML block at the top of a markdown skill file that names it and describes when to invoke it. Dirgha's skill scanner reads frontmatter to decide which skill matches the user's request.

### Headless mode
Running Dirgha non-interactively: `dirgha "your prompt"` for one-shot, `--print` for plain-text output, `--json` for an event stream you can pipe into another tool. No TUI, no overlays.

### Ink
The React-for-the-terminal library Dirgha's TUI is built on. Components are JSX, layout uses flexbox-like primitives, and rendering is differential (only changed regions repaint). Ships at `node_modules/ink`.

### Kernel
The lowest-level orchestration code — the agent loop, the event stream, the tool executor. Provider-agnostic, UI-agnostic. Lives in `src/kernel/`. If you change something here, every model and every UI is affected.

### Local model
An LLM running on your machine via Ollama or llama.cpp instead of a cloud provider. Privacy-first; no key needed; speed depends on your hardware.

### Memory
Long-term notes Dirgha remembers across sessions. `dirgha memory add user "I prefer pnpm over npm"`. Stored in `~/.dirgha/memory/`. Different from session history (which is per-conversation) and from skills (which are reusable workflows).

### Native provider
A provider whose API Dirgha calls directly using its own endpoint and credentials, vs. routing through OpenRouter. `mistral`, `cohere`, `xai`, `groq`, etc. are all native. Lower latency, your own quota, no aggregator margin.

### OpenRouter
A model aggregator. One API key, one endpoint, 370+ models. Free tier exists (`:free` suffix). Useful when you want to try a model without signing up for the vendor directly. Not always the cheapest — vendor's native API is usually cheaper if you commit.

### Overlay
A modal UI element in the TUI: model picker, theme picker, slash autocomplete, file picker, help. Mounted on top of the regular transcript via `overlays.openOverlay('models')` in `App.tsx`.

### Picker
A modal that lets you choose something interactively. Provider picker (stage 1) → model picker (stage 2) is the flow as of 1.12.0. Theme picker is a single stage. Both navigate with `↑↓`, pick with Enter, filter by typing.

### Prompt queue
While the agent is working on your last prompt, you can keep typing. Submissions go into a FIFO queue and drain after the current turn ends. No need to wait. See `App.tsx`'s `promptQueue` state.

### Provider
The LLM vendor — Anthropic, OpenAI, Mistral, etc. Each has a class in `src/providers/<name>.ts` that knows how to talk to that vendor's API. The provider object exposes `stream()`, which yields `AgentEvent`s.

### ReAct
"Reason + Act" — the agent loop pattern where the model alternates between thinking text and tool calls. Each cycle is called a "turn." Default cap is 30 turns per `dirgha ask`.

### Release-please
The GitHub Action that watches commits on `main`, detects conventional-commit prefixes, opens a "release X.Y.Z" PR with an auto-generated CHANGELOG entry, and tags + creates a GitHub Release when you merge it. Configured in `.github/workflows/release-please.yml`.

### Semantic tokens (theme)
The colour-token shape Dirgha's TUI uses: `palette.text.primary`, `palette.status.success`, `palette.ui.active` etc. Maps to a per-theme hex value. Changing the theme swaps colours without changing component code.

### Session
A single conversation with the agent. Has an id, a history (messages), and usage totals. Saved to `~/.dirgha/sessions/`. List with `dirgha audit list`.

### Skill
A markdown file the agent reads to perform a multi-step task. Has frontmatter describing when to invoke it and a body explaining the steps. `add-provider.md` is the canonical example. Skills live in `src/skills/` (built-in) and `~/.dirgha/skills/` (user-installed).

### Slash command
Commands you type in the REPL with a leading `/`. `/help`, `/models`, `/theme`, `/clear`, `/mode`, `/provider list`. Different from subcommands (which run before the REPL starts). Listed in `src/cli/slash/`.

### Static / dynamic ink rendering
Ink has two render modes: `<Static>` items render once at the top and never repaint (the logo); regular components in the dynamic region repaint on every state change. Dirgha uses `<Static>` for the logo and dynamic for the transcript + overlays.

### Streaming
Reading the model's response token-by-token instead of waiting for the whole answer. All providers in Dirgha stream by default. The wire protocol is OpenAI-style Server-Sent Events for most; Anthropic and Gemini use their own.

### Subcommand
The non-REPL surface: `dirgha keys list`, `dirgha doctor`, `dirgha cost`, `dirgha audit`. Each is a separate file in `src/cli/subcommands/`. Subcommands exit when done; they don't open a TUI.

### Telemetry
Anonymous usage data Dirgha can send to help us catch regressions. **Off by default**, opt-in once during setup. 5 fields per command (event, version, command, os, node), 6 on errors. Never sends prompts, responses, file contents, or key values. Disable any time with `dirgha telemetry disable`.

### Theme
A named colour palette: `readable` (default), `dark`, `light`, `dracula`, `github-dark`, `tokyonight`, `atom-one-dark`, `ayu-dark`, `midnight`, `ocean`, `solarized`, `nord`, `cosmic`, `ember`, `sakura`, `obsidian-gold`, `crimson`, `violet-storm`, `warm`, `none`. Switch with `/theme <name>`.

### Tool
A function the agent can call. Has a name, description, JSON schema for inputs, and an `execute()` that returns a `ToolResult`. Built-ins: `fs_read`, `fs_write`, `fs_edit`, `fs_ls`, `search_grep`, `search_glob`, `shell`, `git`, `browser`, `task`. Add new ones in `src/tools/`.

### TUI
Terminal User Interface. The interactive Ink-based screen with the logo, transcript, input box, and overlays. As opposed to the headless mode (`--print` / `--json`).

### Turn
One round-trip in the agent loop: send messages → get response → maybe execute tools → append to history. `--max-turns 30` is the default cap to prevent runaway loops.

### useInput / useStdout
Ink hooks. `useInput((char, key) => {...})` listens for keystrokes. `useStdout()` reads terminal dimensions. Multiple `useInput` listeners co-exist; whichever handles the key first wins.

### Vim mode
Optional input-box behavior where Esc switches to NORMAL and `i` switches to INSERT. Toggle in config: `vimMode: true`.

### Worktree
A separate working copy of a git branch in a sibling directory. `dirgha fleet` uses worktrees so parallel agents don't collide on the same files. Standard git feature; see `git worktree --help`.

---

## Questions

- Issues: https://github.com/Dirgha-AI/dirgha-code/issues
- Email: team@dirgha.ai

Made with care in Delhi · Patan · everywhere.
