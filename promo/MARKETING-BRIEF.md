# Marketing brief — Dirgha Code video script

This brief is the input to a script. The script writer (hy3) reads this, then produces `promo/SCRIPT.md`.

## Research — how the leaders position themselves

Pulled directly from each tool's README hero + landing copy.

| Tool | One-line hero | Specific claim |
|---|---|---|
| **Claude Code** | *"Claude Code is an agentic coding tool that reads your codebase, edits files, runs commands, and integrates with your development tools."* | Verb-led: reads, edits, runs. |
| **OpenCode** | *"The open source AI coding agent. Free models included or connect any model from any provider."* | Open + free + multi-provider. Desktop app + LSP-enabled + multi-session + GitHub Copilot login. |
| **Aider** | *"AI Pair Programming in Your Terminal."* | "Pair-programming" framing. Numbers: 6.8M installs, 15B tokens/week, OpenRouter Top-20, 88% self-written. |
| **Codex CLI** | *"Codex CLI is a coding agent from OpenAI that runs locally on your computer."* | Local + OpenAI brand + ChatGPT Plus integration. |
| **Hermes Agent** | *"The self-improving AI agent built by Nous Research. It's the only agent with a built-in learning loop — it creates skills from experience, improves them during use, nudges itself to persist knowledge…"* | Self-improving / cross-platform (Telegram, Slack, Signal) / serverless backends. |

## Patterns the leaders use (we should adopt)

1. **Verb-led one-liner.** "Reads, edits, runs" — not "a thoughtful tool for engineers." Lead with the action.
2. **Specific numbers as social proof.** Aider has 6.8M installs and 15B tokens/week visible in the hero. Numbers > adjectives.
3. **A relationship name.** "AI Pair Programming" gives the user a metaphor. Hermes is "the agent that learns." We need ours.
4. **Live screencast in the hero.** Aider, opencode, Claude Code all show a moving terminal at the top.
5. **Provider-agnostic stated up front.** Every tool except Codex says "any model" in the first paragraph.
6. **One-line install** — visible in the first scroll.

## Anti-patterns (we should NOT do)

1. **Internal architecture language** like "cheap to write below, curated above." Customers don't care about your data flow.
2. **Architecture diagrams in the first 30 seconds.** Save those for the docs page.
3. **Long taglines** with three beats. The leaders use one sentence.
4. **Competitor names.** None of them mention each other in their landing — they describe what they do, not what others don't.
5. **Engineer-only framing.** Dirgha is also for founders/operators who want defensible tooling on their team's machines. The video should serve both.

## Dirgha's actual differentiation (what's true and unique)

Forget the parity matrix wording. Customers want concrete differentiation:

1. **Multi-key BYOK with cooldown rotation across 17 providers.** No other tool rotates keys when one hits a 429. Dirgha just keeps going.
2. **Mid-session failover that resumes from the partial transcript.** When Anthropic's API blips, the others lose your work. Dirgha swaps to the registered backup and picks up where it left off.
3. **Every third-party skill is scanned before it runs.** Heuristic prompt-injection / supply-chain check at install AND load. We caught 2 critical issues in 112 real installed skills today. Other tools don't even check.
4. **Compiled knowledge base of your repo.** OpenKB + PageIndex builds a wiki of your project's docs, decisions, and ledger. The agent reasons over it instead of re-reading files every turn.
5. **Plugins are TypeScript.** Anyone can write a tool, slash, or hook in 20 lines and ship it as an npm package.

These are five concrete capabilities a competitor can't match by accident. THEY are the marketing copy.

## Audiences — who watches this video?

1. **Developer** — wants to know if it does the work. Cares about: correctness, speed, tests passing, free-tier providers.
2. **Tech founder / engineering lead** — wants to know if it's defensible to deploy on the team. Cares about: BYOK, audit trail, security scanner, no telemetry.
3. **Investor (occasional)** — wants to know if there's a thoughtful product behind the tweet. Cares about: 40/40 tests, ≤200 LOC files, 17 providers, 22 dimensions parity.

The video has to satisfy all three in 90 seconds. The way to do that: show concrete capability moments. Each capability moment has the developer's joy AND the founder's defensibility AND the investor's specifics inside it.

## Length

90 seconds for the public version. (Not 160 — that's too long for a tweet attachment.) A separate 30-second cut for paid social can come later from the same source composition.

## Required content (in some order)

1. **Hero verb-led one-liner.** What Dirgha does in 8 words or fewer. Not "Build to last." That's a tagline, not a what-it-does.
2. **Real terminal demo.** Not a synthetic mock. A real `dirgha "..." -m haiku` running, with real tool calls, real file diffs, real tests passing. 15–20 seconds.
3. **The five differentiators** above, each with a concrete moment that proves it. Not bullet points on screen — show it.
4. **One number panel.** Pick 3 numbers max: 17 providers, 40/40 tests, 0 sum-of-gaps. Or whichever 3 hit hardest. Don't show all six.
5. **Install line.** `npm i -g @dirgha/code`. Single visible second.
6. **CTA.** Two beats: *Build to last. Code with Dirgha.* + the repo URL. Closing card.

## Things to drop from the v2 script

- Scene 5 (architecture stack) and Scene 6 (contract per layer). Combined ~50 seconds of internal jargon. Replace with the five differentiator moments.
- Scene 9 (engineering posture grid of 6 cards). Cut to 3 cards.
- The plugins code snippet — too dense for video. A one-frame "drop a .mjs, register tools/slashes/hooks" line is enough.

## The relationship name

Pick one of these (or write a better one):

- *"Pair programming with the agent that scans every skill before it runs."* — anchors to Aider's frame, differentiates with security.
- *"A coding agent that doesn't blink when a model dies."* — anchors to the failover differentiator.
- *"The agent that compiles your repo into knowledge instead of re-reading it."* — anchors to KB.

Whichever the script writer picks, that line should appear on screen at ~0:08 (right after the demo opens).

## Tone

The DESIGN.md voice rules apply. **Direct. Specific. No marketing flourish.** Past Dirgha videos have failed because they leaned into mood (typewriter feel, ambient drone, slow fades) instead of capability. Keep the brand chrome quiet; let the capability moments be loud.

## Deliverable

`promo/SCRIPT.md` — a Markdown file with:

- Section 1: The verb-led one-liner (8 words max)
- Section 2: 90-second scene plan as a table (`time | scene | content | text on screen | voiceover (none — silent video) | rationale`)
- Section 3: A summary of which leader pattern each scene uses + which Dirgha differentiator it surfaces
- Section 4: A self-score: 1–10 on (a) does the hero satisfy a developer in 5s? (b) does the founder see the defensibility? (c) does the investor see the specifics? (d) does it stay under 90s? (e) is it producible from the existing tokens + audio + assets?

When you're done, report the file path and your self-score. Don't render anything — that's a separate step.
