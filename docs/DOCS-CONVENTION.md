# Doc-writing convention

The agent (and humans) follow this convention every time a doc is added under `docs/`.

## Index tree

The file tree below is the **canonical layout**. New docs go under one of these paths. If a doc doesn't fit, propose a new top-level slot — don't bury it.

```
docs/
├── ARCHITECTURE.md             Single-source overview: purpose, vision, what is/isn't, kernel + provider model.
├── ROADMAP.md                  Per-sprint chronology of shipped + on-deck + constraints.
├── DOCS-CONVENTION.md          This file. The contract for all writing under docs/.
├── CHANGELOG.md                Hosted at the package root, mirrored here for searchability.
├── soul.md                     The dirgha persona body (kept in src_v2/context/default-soul.md, copied at build).
├── install.md                  Concrete install + first-run for every supported shell.
├── providers.md                The 17-provider catalogue with env names + base URLs + where to mint a key.
├── agents/                     How agents (model + dirgha) are configured.
│   ├── soul.md                 How to author / override the soul.
│   ├── skills.md               agentskills.io frontmatter + `dirgha skills install <git-url>`.
│   ├── extensions.md           TS/ESM extensions API; ~/.dirgha/extensions/<name>/index.mjs shape.
│   ├── modes.md                act / plan / verify / ask + the kernel-hook gate.
│   └── hooks.md                ~/.dirgha/hooks.json + AgentHooks shape.
├── memory/
│   ├── ledger.md               jsonl + digest + TF-IDF cosine search; per-scope.
│   ├── memory.md               long-term key-value memory (~/.dirgha/memory/).
│   ├── audit.md                events.jsonl writer + reader subcommand.
│   ├── kb.md                   OpenKB + PageIndex integration (compiled wiki, vectorless RAG).
│   └── km-architecture.md      How ledger + memory + audit + kb compose into one knowledge graph.
├── parity/
│   └── CLI_PARITY_MATRIX.md    The binding contract; every closure cites code + test.
├── audits/
│   ├── HY3-AUDIT-2026-04-25.md First synthesis run.
│   └── AUDIT-<date>.md         One per `dirgha audit-codebase` run.
├── (release notes live in `changelog/<version>.md` at the repo root — see `changelog/README.md` for the convention)
├── sessions/                   End-of-day notes per /feedback_daily_practice.
│   └── YYYY-MM-DD.md
└── _internal/                  Anything that mentions competitor names by design (parity benchmarks).
    └── ...
```

## Writing rules

1. **Single H1 per file.** It matches the filename (case relaxed).
2. **One sentence per line for body prose** — easier diffs, easier reviews.
3. **Cite code.** When you reference a function or behaviour, point at `path/to/file.ts:line`. The agent must verify the path exists before citing.
4. **No competitor names** in any doc except `_internal/`. Comparisons live there only.
5. **No flattery, no "We are excited to announce..."**. Direct language. If the doc is about what's shipped, the body says what's shipped.
6. **Tables for parity, prose for prose.** Don't smear bullet points into paragraphs.
7. **Code blocks** name their language: `\`\`\`bash`, `\`\`\`typescript`, `\`\`\`json`. Bare triple-backtick is OK only for terminal output you're quoting verbatim.
8. **Cap length.** Architecture / convention / roadmap files cap at ~250 lines. Audits and changelogs scale with content.
9. **Date-stamp** anything ephemeral. `AUDIT-2026-04-25.md` not `latest-audit.md`.
10. **Cross-link** with relative paths: `[Architecture](./ARCHITECTURE.md)`, `[Memory](./memory/ledger.md)`. Never `https://github.com/...` for self-references.

## When the agent writes a doc

```
1. Decide the slot — pick from the tree above. Add a new slot only if nothing fits, then update DOCS-CONVENTION.md in the same change.
2. Skim the nearest siblings — the new doc must match their voice + format.
3. Draft. One sentence per line. Code citations real.
4. Append it to the index tree in DOCS-CONVENTION.md if the file is new.
5. Add a one-line entry under the relevant section of CHANGELOG.md when shipped.
```

## When the user asks "how does X work?"

The agent answers in two places:
1. A reply in chat (terse, with the code path).
2. If the user asks more than once, the agent writes a new doc under the right slot and links to it next time.

## Forbidden patterns

- "We are pleased to announce…" / "Excited to share…"
- "Going forward, we recommend…" (direct: "Use X.")
- "Comprehensive solution" / "best-in-class" / marketing adjectives
- Mentioning a competitor by name outside `_internal/`
- Inserting AI-generated changelog noise like "improved performance" without a measurement
