# Getting started — 5 minutes to first agent

## 1. Install

```bash
npm install -g @dirgha/code
```

Requires Node 20+. Binary installs as both `dirgha` and `d`.

## 2. Get a key (one-time)

Pick the easiest option for you.

**Free & fast — NVIDIA NIM**
```
→ https://build.nvidia.com/explore/discover
  Sign up (free), copy your API key.
```
```bash
dirgha keys set NVIDIA_API_KEY nvapi-...
```

**Free & reliable — OpenRouter**
```
→ https://openrouter.ai/keys
```
```bash
dirgha keys set OPENROUTER_API_KEY sk-or-v1-...
```

**Already paying for Claude?**
```bash
dirgha keys set ANTHROPIC_API_KEY sk-ant-...
```

**Prefer a managed experience?**
```bash
dirgha signup    # opens dirgha.ai/signup
dirgha login
```

Full provider list: [`docs/BYOK.md`](./BYOK.md).

## 3. Initialize your project

From inside a git repo:

```bash
dirgha init
```

This scans the project, generates a `~/.dirgha/project.json` fingerprint,
and builds a repo map the agent uses to ground its work. Runs once; safe
to re-run after major structural changes.

## 4. Ask your first question

### Interactive (TUI)

```bash
dirgha
```

Opens the Ink-based chat surface. Type naturally:

```
❯ what does src/providers/dispatch.ts do?
```

The agent reads the file, explains it, and offers next steps. `Esc`
cancels the current turn. `Ctrl+C` exits.

### Headless (one-shot)

```bash
dirgha ask "summarise the last 5 commits"
```

Returns a single answer to stdout and exits.

### With JSON (scripts, CI)

```bash
dirgha ask "list all TODO comments in src/" --json | jq .data.stdout
```

Every Dirgha command supports `--json`. See the main README's
[headless section](../README.md#headless--machine-readable----json-on-every-command).

## 5. Make changes

```
❯ add a "verbose" flag to the logger that prints request bodies
```

The agent:
1. Reads the logger module
2. Plans the change
3. Writes the edit
4. Runs tests if any
5. Shows you the diff

You approve (`y`), reject (`n`), or keep iterating. Nothing merges until
you say so.

## 6. Scale up — parallel work

When your request is big enough to split:

```bash
dirgha fleet launch "migrate auth to JWT + add rate limiter + update docs"
```

Dirgha decomposes the goal into 2-5 independent subtasks, spawns an
agent per subtask in its own git worktree, and streams their progress.
After completion, review each agent's diff with `git diff` in its
worktree, or apply-back with `dirgha fleet merge <agent-id>`.

Full guide: [`docs/FLEET.md`](./FLEET.md).

## 7. Pick up where you left off

Sessions are persisted to `~/.dirgha/sessions.db` automatically.

```bash
dirgha                           # resumes your last session
dirgha --resume                  # pick from recent
dirgha resume <session-id>       # headless resume
```

## Common next steps

| You want to… | Run |
|---|---|
| See all commands | `dirgha --help` or `/help` inside TUI |
| Switch model mid-session | `/model` inside TUI |
| Add a custom skill | `dirgha hub install <name>` |
| Connect an MCP server | Edit `~/.dirgha/mcp.json`, restart |
| Take a restore-point | `/checkpoint` before risky changes |
| Run in read-only mode | `/plan` (no edits, no bash) |
| See token cost | `/cost` or `/status` |
| Undo last agent change | `/rollback` |
| Ask a throwaway question | `/side <prompt>` — doesn't pollute history |

## Keyboard shortcuts in the TUI

| Key | Action |
|---|---|
| `Enter` | Send message |
| `Shift+Enter` | Newline in input |
| `Esc` | Cancel running turn, or close modal |
| `Ctrl+C` | Exit Dirgha |
| `Ctrl+R` | Reverse history search |
| `Ctrl+K` | Clear input |
| `Ctrl+E` | Open input in `$EDITOR` |
| `↑↓` | Scroll history |
| `/` | Open slash-command autocomplete |
| `@` | Open file-path autocomplete |

## Where to go next

- **Full command reference** — [`docs/COMMANDS.md`](./COMMANDS.md)
- **Fleet (parallel multi-agent)** — [`docs/FLEET.md`](./FLEET.md)
- **Provider setup (BYOK)** — [`docs/BYOK.md`](./BYOK.md)
- **Architecture deep dive** — main [README.md](../README.md#architecture)
- **CHANGELOG** — [`CHANGELOG.md`](../CHANGELOG.md)
