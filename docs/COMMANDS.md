# Command reference

Dirgha exposes two command surfaces:

1. **Top-level commands** — `dirgha <cmd> [args]` from the shell
2. **Slash commands** — `/<cmd>` inside the interactive TUI

The canonical machine-readable manifest is [`SKILL.md`](../SKILL.md) at
the repo root — auto-generated on every build from commander
introspection (57+ commands). Use that for tooling. This doc is the
human-facing narrative.

## Top-level commands

### Auth & account

```bash
dirgha login                       # device-flow browser sign-in
dirgha login --token <t>           # headless: paste a token from dirgha.ai/dashboard
dirgha login --browser             # auto-open the sign-in URL
dirgha signup                      # open dirgha.ai/signup
dirgha logout                      # clear saved credentials
dirgha status                      # account, quota, sessions, project
dirgha keys set <KEY> <value>      # save a BYOK key
dirgha keys list                   # show saved keys (masked)
dirgha keys delete <KEY>           # remove a key
dirgha doctor                      # full health check
```

### Core workflow

```bash
dirgha                             # launch TUI
dirgha init                        # scan current directory, build repo map
dirgha ask "<prompt>"              # one-shot headless query
dirgha ask --max-turns 5 --model claude-sonnet-4-6 "<prompt>"
dirgha ask --resume <session-id>   # continue from a saved session
dirgha chat                        # pure chat (no tools)
```

### Fleet — parallel multi-agent

```bash
dirgha fleet launch "<goal>"       # decompose + spawn N agents in worktrees
dirgha fleet launch --plan-only    # preview decomposition, don't spawn
dirgha fleet launch --concurrency 5 --max-turns 20 "<goal>"
dirgha fleet triple "<goal>"       # 3 variants + judge picks winner
dirgha fleet triple --auto-merge "<goal>"
dirgha fleet list                  # show active fleet worktrees
dirgha fleet merge <agent-id>      # 3-way apply-back to main working tree
dirgha fleet cleanup               # remove all fleet worktrees + branches
```

Full guide: [`docs/FLEET.md`](./FLEET.md).

### Models & providers

```bash
dirgha models                      # show commands
dirgha models list                 # list all models, grouped by provider
dirgha models list --json          # machine-readable
dirgha models info <id>            # detail for one model
```

### Hub — CLI-Anything plugins

```bash
dirgha hub search <query>          # search the plugin registry
dirgha hub list                    # top 20 plugins
dirgha hub list --installed        # only what you've installed
dirgha hub install <name>          # install a plugin
dirgha hub remove <name>           # uninstall
dirgha hub info <name>             # plugin metadata
dirgha hub categories              # list categories with counts
```

### Sessions

```bash
dirgha session                     # show commands
dirgha session list                # all saved sessions
dirgha session show <id>           # inspect one
dirgha session delete <id>         # remove
dirgha resume <id>                 # continue a session headlessly
```

### Sprint engine (long-horizon work)

```bash
dirgha sprint start <manifest>     # begin a YAML-defined sprint
dirgha sprint status               # show current progress
dirgha sprint pause
dirgha sprint resume
dirgha sprint abort
dirgha sprint list
dirgha sprint log                  # tail sprint logs
```

### Scanning & safety

```bash
dirgha scan                        # scan for secrets, vulnerabilities
dirgha checkpoint                  # save a restore point
dirgha rollback <name>             # restore from checkpoint
```

### Developer utilities

```bash
dirgha update                      # self-update to latest
dirgha verify                      # system + skills health check
dirgha __dump_spec                 # JSON tree of all commands (tooling)
```

### Global flags (apply to every command)

| Flag | Effect |
|---|---|
| `--json` | Emit machine-readable envelope instead of human text |
| `--debug` | Verbose logging to stderr |
| `--yolo` / `--dangerously-skip-permissions` | Bypass approval prompts |
| `--resume <id>` | Resume a session |
| `-e, --with-extension <json>` | Load an extension config |
| `--max-budget <usd>` | Hard cap on token cost |
| `-V, --version` | Print version |
| `-h, --help` | Help for this level |

## Slash commands (inside TUI)

Total: 85+ commands. `/help` opens a searchable modal — type to filter,
↑↓ to scroll, `q` or `Esc` to close.

### Session

| Command | What it does |
|---|---|
| `/help` | Modal overlay with all commands |
| `/status` | Account, quota, sessions |
| `/clear` | Clear screen + conversation history |
| `/compact` | AI-summarize conversation to save tokens |
| `/cost` | Session $ estimate |
| `/tokens` | Token counter |
| `/save` | Save session with optional name |
| `/export` | Export as markdown, HTML, or JSON |
| `/resume` | Restore a saved session |
| `/copy` | Copy last reply to clipboard (OSC 52) |
| `/summary` | AI-generated conversation summary |
| `/cache` | Prompt cache hit statistics |
| `/workspace` | Cwd, branch, project type |
| `/credits`, `/usage` | Quota bars |

### Auth & config

| Command | What it does |
|---|---|
| `/login`, `/logout` | Dirgha account |
| `/setup` | Onboarding wizard |
| `/model` | Switch model — opens picker |
| `/keys` | Manage BYOK keys |
| `/config` | Show/set config |
| `/theme` | Switch color theme |
| `/bind` | Keybindings |
| `/soul` | Agent persona (Architect, Cowboy, Security…) |
| `/local` | Local llama.cpp status |

### Dev workflow

| Command | What it does |
|---|---|
| `/spec` | Activate spec-writing skill |
| `/plan`, `/unplan` | Read-only mode toggle |
| `/qa` | QA checklist on recent changes |
| `/review` | Code review |
| `/debug` | Toggle raw API response logging |
| `/fix` | Auto-fix lint / type / test errors |
| `/refactor` | Clarity refactor |
| `/scaffold` | shadcn + Phosphor component scaffold |
| `/changes` | Files modified this session |
| `/vim` | Vim keybindings toggle |
| `/reasoning`, `/effort`, `/fast` | Control thinking depth |
| `/side <prompt>` | Ephemeral sub-agent — no history pollution |
| `/verbose` | Cycle stream verbosity: off → new → all → verbose |

### Git

| Command | What it does |
|---|---|
| `/diff` | `git diff` |
| `/commit` | Stage + commit (optional AI-gen message) |
| `/stash` | Stash management |
| `/push` | Push current branch |
| `/branch` | List/create branches |
| `/checkout` | Checkout branch |

### Memory & knowledge

| Command | What it does |
|---|---|
| `/memory` | Show persistent memory |
| `/remember <fact>` | Save a curated fact |
| `/recall <query>` | Query knowledge graph |
| `/curate <content>` | Save with tags |
| `/gc` | Garbage-collect old memories |

### Safety

| Command | What it does |
|---|---|
| `/checkpoint` | Save a restore point |
| `/rollback` | Restore from checkpoint |
| `/permissions` | Set permission level |
| `/yolo` | Bypass approvals |
| `/approvals` | Manage pending approvals |
| `/btw` | Ephemeral question (not saved) |

### Skills & tools

| Command | What it does |
|---|---|
| `/skills` | List/enable skills |
| `/init` | Scan project |
| `/scan` | Scan files for issues |
| `/secrets` | Redact secrets |

### System

| Command | What it does |
|---|---|
| `/verify` | System + skills health |
| `/doctor` | Detailed diagnostics |

### Integrations

| Command | What it does |
|---|---|
| `/mcp` | MCP server connections |
| `/voice` | Voice input mode |
| `/cron` | Scheduled jobs |
| `/net` | Network rules |
| `/fs` | Virtual mount management |
| `/team` | Multi-agent team management |
| `/consensus` | Multi-agent consensus |
| `/screen` | Screenshot (macOS) |
| `/drop` | Remove a file/dir from session context |
| `/undo` | Undo last change |

### Sprint engine

| Command | What it does |
|---|---|
| `/sprint` | Sprint controls (status/pause/resume/log/skip/abort/list) |
| `/run <plan>` | Run orchestrator on a plan file |

### Multi-agent

| Command | What it does |
|---|---|
| `/orchestrate <task>` | Plan → Code → Verify pipeline |
| `/side <prompt>` | Ephemeral sub-agent fork |

## Environment variables

Dirgha respects these env vars:

| Var | Default | Effect |
|---|---|---|
| `DIRGHA_API_URL` | `https://api.dirgha.ai` | Override gateway URL |
| `DIRGHA_PROVIDER` | auto-detect | Force provider (`openrouter`, `nvidia`, etc.) |
| `DIRGHA_CODE_MODEL` | provider default | Force specific model |
| `DIRGHA_LOCAL_MODEL` | — | Pin to a local Ollama model |
| `DIRGHA_JSON_OUTPUT` | `0` | `1` enables JSON envelope on all commands |
| `DIRGHA_DEBUG` | `0` | Verbose logging to stderr |
| `DIRGHA_VERBOSE` | `new` | Stream verbosity: `off`, `new`, `all`, `verbose` |
| `DIRGHA_YOLO` | `0` | Bypass approval prompts |
| `DIRGHA_SKIP_PERMISSIONS` | `0` | Same as `--yolo` |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc. | — | BYOK provider keys |

## Machine-readable outputs

Every command supports `--json`:

```bash
dirgha status --json
dirgha fleet list --json
dirgha hub search ollama --json
dirgha models list --json
```

Envelope shape:

```json
{
  "data":    { "…": "structured payload" },
  "text":    "human-readable output (ANSI stripped)",
  "exitCode": 0,
  "command":  "<cmd name>",
  "timestamp": "ISO-8601",
  "meta":     { "durationMs": 27 }
}
```

For the full commander tree in JSON:

```bash
dirgha __dump_spec > spec.json
```
