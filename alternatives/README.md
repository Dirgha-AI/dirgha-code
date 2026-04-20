# AI Coding CLI Landscape

A living reference of terminal-native AI coding agents. Maintained as
part of the Dirgha Code repository because we believe:

- **Users deserve an honest comparison** before picking a CLI
- **Attribution > competition** — we've borrowed patterns from most of these tools and want to track the lineage
- **The category is young** — worth documenting as it crystallises

Not affiliated with any of the projects listed. Descriptions based on
public repos and docs as of the date of last update (see footer).

## Contents

- **[top-10.md](./top-10.md)** — comparison table of the 10 most
  significant AI coding CLIs, with architecture, license, and standout
  feature per tool.

## How Dirgha positions

| Axis | Dirgha Code |
|---|---|
| **Sovereignty** | BYOK-first, no telemetry, keys local |
| **Parallelism** | Built-in fleet (N agents in git worktrees) |
| **Output contract** | CLI-Anything `--json` on every command |
| **Stack** | TypeScript + Ink + React — single npm bundle |
| **Scope** | Coding agent only (not trying to be a browser automator or a knowledge base or a chatbot) |

We are **not** trying to beat Claude Code on raw coding quality — their
intelligence comes from the Anthropic model we don't have. We are trying
to give you the same terminal experience without the per-seat SaaS
surrender.

## Contributing

Know of a CLI we've missed? Spotted a factual error?
Open a PR editing [`top-10.md`](./top-10.md) or [file an issue](https://github.com/dirghaai/dirgha-code/issues).

Rules for inclusion:

- Must be a standalone CLI tool (not a plugin for another CLI)
- Must have a public repo or documented API surface
- Must be used specifically for coding / software engineering tasks
  (not general-purpose chat wrappers)

## Why this lives here

The alternative to keeping this landscape doc is keeping nothing — which
means every new user has to discover these tools themselves. We've
benefited from each of these projects and want the knowledge shared.

If this directory outgrows its parent repo (becomes a real CLI
directory beyond just "compare to Dirgha"), we'll split it to
`github.com/dirghaai/cli-landscape`.
