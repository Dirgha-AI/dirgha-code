# Fleet — parallel multi-agent in git worktrees

`dirgha fleet` runs multiple Dirgha sub-agents concurrently, each in its
own isolated [git worktree](https://git-scm.com/docs/git-worktree). You
stay in your normal working tree. Agents can't step on each other, can't
touch your uncommitted work, and leave clean diffs you review at the end.

This is the Dirgha version of the pattern used by
[multica](https://github.com/multica-ai/multica),
[ccpm](https://github.com/automazeio/ccpm),
[claudio](https://github.com/Iron-Ham/claudio), and
[genie](https://github.com/automagik-dev/genie) — with one addition:
every agent runs your exact Dirgha binary with your exact provider
config, so behaviour inside the worktree matches behaviour outside.

## Quick start

```bash
# Decompose + run in parallel
dirgha fleet launch "add rate limiting to /api/auth + tests"

# 3 variants + judge picks best
dirgha fleet triple "refactor the order pipeline"

# Show all worktrees
dirgha fleet list

# Apply one agent's diff back to your branch (unstaged)
dirgha fleet merge auth-middleware

# Remove all fleet worktrees + branches
dirgha fleet cleanup
```

## Lifecycle

```
1. Decompose      ─ model breaks goal into 2-5 independent subtasks (JSON)
2. Worktree       ─ git worktree add .fleet/<branch> per subtask
3. Spawn          ─ fork `dirgha ask --quiet` subprocess per worktree
4. Stream         ─ events flow to TUI FleetPanel + terminal progress
5. Completion     ─ each agent commits inside its worktree (transient)
6. Review         ─ `dirgha fleet merge <id>` applies diff to parent — UNSTAGED
7. Ship or drop   ─ you review the diff and `git add`/`git stash`/discard
```

## Concepts

### Worktree isolation
Each agent's `cwd` is `<repo>/.fleet/<branch>/`. Worktrees share the git
object store with your main checkout but have their own working tree,
HEAD, and index. Agents can edit, run tests, install deps — nothing
leaks into your working directory.

### Subtask decomposition
The decomposer prompt asks the model to produce **independent** streams
— tasks that can run without coordinating on the same files. The model
returns JSON:

```json
{
  "subtasks": [
    { "id": "auth-middleware", "title": "Wire JWT check",      "task": "…", "type": "code" },
    { "id": "jwt-service",     "title": "Add token signing",   "task": "…", "type": "code" },
    { "id": "rate-limiter",    "title": "Redis bucket limiter","task": "…", "type": "code" }
  ]
}
```

Agent types (each with its own tool allowlist):
- `explore` — read-only; safe for investigation
- `plan`    — read-only + web; produces step-by-step plans
- `verify`  — read + bash; runs tests/lint
- `code`    — full R/W; makes changes
- `research`— web_fetch + web_search; for external knowledge

### Transient-commit 3-way apply-back
When you run `dirgha fleet merge <id>`, Dirgha:

1. `git add -A` inside the worktree
2. `git commit -m "fleet: <msg>"` (transient — lives only in the worktree branch)
3. Generate a diff between worktree HEAD and your parent HEAD
4. `git apply --3way` the diff in your main worktree as **unstaged** changes

Benefits over `git merge`:
- No merge commit, no branch history noise in your main
- 3-way handles conflicts automatically when possible
- Unstaged = reversible; you review before `git add`
- The worktree is independent and you can discard it at any time

### TripleShot + judge (claudio pattern)
For high-stakes tasks, spawn three variants with different stylistic
guidance:

- `conservative` — minimal changes, backward compatible, smallest diff
- `balanced`     — clean where it helps, focused scope
- `bold`         — aggressive refactor of adjacent code when it improves the change

After all three complete, a **judge agent** sees the goal + all three
diffs and picks the winner. With `--auto-merge`, the winner's diff is
applied back automatically.

```bash
dirgha fleet triple "make the API rate limiter sliding-window"
dirgha fleet triple --auto-merge "convert callbacks to async/await"
```

Cheap with fast models (NVIDIA MiniMax, free OpenRouter tier), massive
quality bump vs single-shot on refactors.

## TUI dashboard — `FleetPanel`

When the TUI is open and any fleet is active, a panel appears above the
input box:

```
┌─ fleet ─────────────────────────────────┐
│ fleet  2 running · 1 done · 0 failed    │
│ migrate auth to JWT + add rate limiter  │
│ ⠙ auth-middleware     auth-middleware 12s │
│ ⠹ jwt-service         jwt-service      9s │
│ ✓ rate-limiter        rate-limiter     5s │
└─────────────────────────────────────────┘
```

Status dots: `⠙` running (animated braille spinner), `✓` done,
`✗` failed, `⊘` cancelled, `○` pending. Elapsed time ticks in real
time. Panel auto-hides 5 seconds after the fleet completes.

## Flags reference

### `dirgha fleet launch <goal>`

| Flag | Default | Purpose |
|---|---|---|
| `-c, --concurrency <n>` | `3` | Max agents running at once |
| `-n, --max-turns <n>`   | `15` | Max agent loop iterations per subtask |
| `-m, --model <id>`      | your current | Model for decomposition + agents |
| `-v, --verbose`         | off | Stream per-agent output to stderr |
| `--plan-only`           | off | Decompose & preview without spawning |

### `dirgha fleet triple <goal>`

| Flag | Default | Purpose |
|---|---|---|
| `-m, --model <id>`      | your current | Model for variants + judge |
| `-n, --max-turns <n>`   | `15` | Max agent loop iterations |
| `--auto-merge`          | off | Apply winner's diff to your branch automatically |

### `dirgha fleet merge <agent-id>`

| Flag | Default | Purpose |
|---|---|---|
| `--message <msg>` | `fleet: <agent-id>` | Transient commit message |

### `dirgha fleet cleanup`

| Flag | Default | Purpose |
|---|---|---|
| `-f, --force` | off | Force removal even with uncommitted changes |

## When to use which command

| Situation | Use |
|---|---|
| "I want X done, not sure how to split it" | `fleet launch` |
| "I want options for a high-stakes refactor" | `fleet triple` |
| "I want to see the plan before committing to spawn" | `fleet launch --plan-only` |
| "I want to run one throwaway sub-agent" (no worktree) | `/side` in TUI |
| "I want a structured plan → code → verify pipeline" | `dirgha orchestrate` |

## Model recommendations

Fleet works best with fast, cheap models since each subtask is bounded
and independent:

- **Free tier:** `openrouter/elephant-alpha` or `qwen/qwen3-coder:free`
- **BYOK NVIDIA:** `minimaxai/minimax-m2.7` (recommended — fast, stable)
- **Hosted gateway:** `minimax-m2` (routes to AtlasCloud via dirgha.ai)

Avoid Claude Opus / GPT-5 for fleet unless you need them — token cost
scales with N agents × turns.

## Troubleshooting

**"Not inside a git repo"**
Fleet requires a git-tracked project. Run `git init` first.

**Agent exits with `exit 1` immediately**
The subprocess couldn't find or auth with the model. Run `dirgha status`
inside the worktree to verify. Worktrees inherit your `~/.dirgha/`
config, so if auth works outside it works inside.

**Merge fails with conflicts**
Output shows conflicted files. Resolve them manually in your main
working tree, then `git add` the resolution. The worktree is unchanged
and can be reviewed/discarded independently.

**"No changes in worktree"**
Agent completed but didn't write anything. Either the task was
read-only (explore/plan) or the model decided no code change was needed.
Check `~/.dirgha/checkpoints/fleet_<id>_*.json` for the full transcript.

## Under the hood

- `src/fleet/types.ts` — type definitions
- `src/fleet/worktree.ts` — git worktree create/destroy helpers
- `src/fleet/decompose.ts` — LLM-driven goal → subtasks
- `src/fleet/runtime.ts` — parallel subprocess orchestration
- `src/fleet/apply-back.ts` — 3-way merge back to parent
- `src/fleet/tripleshot.ts` — 3 variants + judge
- `src/fleet/events.ts` — EventEmitter bus for FleetPanel
- `src/fleet/commands.ts` — commander wiring
- `src/tui/components/FleetPanel.tsx` — live dashboard

Total fleet subsystem: ~800 lines of TypeScript.
