# Build a TODO app in 10 minutes with Dirgha Code

Fresh machine, no repo, no keys set up. By the end you'll have a working
React + Express TODO app, tests, a commit, and a deploy target. Total
wall-clock: ~10 minutes on a normal laptop. Total input from you: ~6
commands.

## Minute 0 — install

```sh
npm install -g @dirgha/code
dirgha --version     # 0.1.0 (or newer)
```

Requires Node 20+. Windows: use WSL.

## Minute 1 — log in (one time)

```sh
dirgha login
```

Opens your browser. Device-flow handshake. Credentials land at
`~/.dirgha/credentials.json` (mode 0600). Verify:

```sh
dirgha status
```

You should see your email, plan tier, and quota. Skip this step if you
prefer BYOK — just `export ANTHROPIC_API_KEY=sk-ant-...` (or OpenAI,
NVIDIA, OpenRouter — `dirgha auth` lists them all).

## Minute 2 — scaffold the project

```sh
mkdir todo-app && cd todo-app
dirgha init
```

`init` creates `.dirgha/config.json`, detects the working directory as
a new project, and registers it for session tracking.

## Minute 3 — have the agent build the skeleton

```sh
dirgha ask "Create a minimal TODO app: Express server at port 3000, a single index.html at / that renders a list, JSON API at /api/todos (GET + POST). Use vanilla JS on the frontend — no framework. Add a package.json with a start script."
```

The agent will:
- Use `write_file` for server.js, index.html, package.json
- Use `run_command` for `npm install express`
- Stream narration of what it's doing to stderr, final result to stdout

Expect ~30 seconds wall-clock. About $0.002 in tokens (gateway pricing).

**Verify:**

```sh
npm start &               # starts server on :3000
curl -s localhost:3000/api/todos
# []
curl -s -X POST localhost:3000/api/todos -d '{"text":"buy milk"}' -H 'content-type: application/json'
curl -s localhost:3000/api/todos
# [{"id":"...","text":"buy milk"}]
```

## Minute 4 — save a checkpoint before risky edits

```sh
dirgha checkpoint save skeleton-working
```

Shadow-git snapshot of everything in the workdir. Restores with
`dirgha rollback skeleton-working` — doesn't touch your actual git
history.

## Minute 5 — run three agents in parallel (fleet)

Ask for three orthogonal features at once. The fleet engine decomposes
the goal into isolated git worktrees and runs one agent per worktree.

```sh
dirgha fleet launch --concurrency 3 "add these three features: (1) a DELETE /api/todos/:id endpoint, (2) a 'mark done' toggle in the UI that PATCHes /api/todos/:id, (3) a vitest unit test that spins up the server and tests GET/POST/PATCH/DELETE end-to-end"
```

Each agent commits into its own worktree under `.fleet/`. The CLI
prints a live dashboard: ` ◐ agent-id 12s` → `✓ agent-id 47s`.

Review the three diffs:

```sh
dirgha fleet list
git diff fleet/add-delete-endpoint..main -- server.js
git diff fleet/add-toggle-ui..main -- index.html
git diff fleet/add-vitest-tests..main -- tests/
```

Accept all three (or a subset):

```sh
dirgha fleet merge add-delete-endpoint
dirgha fleet merge add-toggle-ui
dirgha fleet merge add-vitest-tests
```

## Minute 7 — run the tests the agent wrote

```sh
npx vitest run
# 4 pass
```

Something broke? Roll back a single fleet merge:

```sh
git reset --hard HEAD~1
# or: dirgha rollback skeleton-working
```

## Minute 8 — remember what worked

Save a memory the next session will pick up automatically:

```sh
dirgha remember "This project uses Express + vanilla JS (no framework). Tests live in tests/ and use vitest. 'npm start' boots server on :3000."
```

Next time you `dirgha ask` in this project, the agent sees this in
its context without you typing it.

## Minute 9 — inspect what the agent touched, commit, ship

```sh
git status
git diff
git add -A && git commit -m "feat: TODO app with delete + toggle + tests"
```

## Minute 10 — add a vision check (optional)

If you have `agent-browser` installed, you can screenshot the UI and
ask the agent how it looks:

```sh
npm install -g agent-browser && agent-browser install
dirgha ask "navigate the browser to http://localhost:3000, take a screenshot, and use action=vision to describe the UI. Suggest one visual improvement."
```

Agent → `browser navigate` → `browser vision` → describes the page
using a vision-capable model → proposes one concrete change.

## What's next

- `dirgha sprint start plan.yaml` — multi-step autonomous execution
  with verification gates. See `docs/SPRINT.md`.
- `dirgha session fork main add-auth` — branch the whole conversation
  (not just the code) so you can try two approaches in parallel.
- `dirgha remember --type rule --condition "when writing API tests" --action "always use supertest"` — rules the agent applies automatically.
- `dirgha mcp add filesystem-server npx @mcp/server-filesystem ~/projects` — plug in an MCP server to extend the agent's toolset.
- `dirgha --help` — 51 commands total. `DIRGHA_EXPERIMENTAL=1 dirgha --help` shows 8 more.

## Common gotchas

- **"Command not found: dirgha"** — check `npm bin -g` and make sure
  that dir is on your PATH. Or install with pnpm.
- **"Quota exceeded"** — you're on the free tier and over today's
  limit. Either upgrade at dirgha.ai/pricing or switch to BYOK with a
  provider key.
- **Fleet agent produced wrong files** — that's why we checkpoint
  first. `dirgha rollback skeleton-working` and try again with a
  sharper prompt.

## Scripted end-to-end

The whole tutorial as one shell script (useful for CI smoke tests):

```sh
#!/usr/bin/env bash
set -euo pipefail
mkdir todo-app && cd todo-app
dirgha init
dirgha ask "Create a minimal Express TODO app — server.js on :3000, index.html, package.json with 'start' script, GET/POST /api/todos."
dirgha checkpoint save skeleton-working
dirgha fleet launch --concurrency 3 "(1) DELETE /api/todos/:id, (2) 'done' toggle via PATCH, (3) vitest tests end-to-end"
dirgha fleet list | grep '✓'
git add -A && git commit -m "feat: TODO app MVP"
```

Ten minutes. Real app. No boilerplate you didn't intend.
