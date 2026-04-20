# Dirgha Code — documentation

Start here:

- **[Getting Started](./GETTING_STARTED.md)** — 5 minutes, zero to first agent
- **[BYOK](./BYOK.md)** — bring your own provider key (14 supported)
- **[Fleet](./FLEET.md)** — parallel multi-agent in git worktrees (the headline feature)
- **[Commands](./COMMANDS.md)** — every CLI and slash command
- **[TUI parity roadmap](./TUI_PARITY_ROADMAP.md)** — what's shipped, what's next

For architecture, philosophy, license, and links see the main
[README.md](../README.md).

Machine-readable:
- **[SKILL.md](../SKILL.md)** — CLI-Anything-compliant manifest, auto-generated
- **[CHANGELOG.md](../CHANGELOG.md)** — release notes
- **`dirgha __dump_spec`** — full commander tree as JSON

## External references

Dirgha's architecture was synthesised from audits of the best CLI agents
in the ecosystem. If you want deeper context on specific patterns:

| Concept in Dirgha | Source reference |
|---|---|
| Parallel worktree agents | [nekocode/agent-worktree](https://github.com/nekocode/agent-worktree), [multica](https://github.com/multica-ai/multica) |
| Stream decomposition + GitHub Issues as state | [automazeio/ccpm](https://github.com/automazeio/ccpm) |
| TripleShot + judge | [Iron-Ham/claudio](https://github.com/Iron-Ham/claudio) |
| 3-way apply-back | [boxabirds/maw](https://github.com/boxabirds/maw) |
| Tool output cap, paste-burst detector, shimmer | [openai/codex](https://github.com/openai/codex) |
| Modal overlays, paste-collapse, `/verbose` cycle | [nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent) |
| SKILL.md + `--json` CLI-Anything contract | [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything) |

Thanks to all of these projects — we stand on their shoulders.
