# Dirgha Code — Usage

Ten worked examples covering the surfaces most users touch. Every
snippet is copy-pasteable. Assumes you've run `npm install -g
@dirgha/code` (Node 20+).

---

## 1. Log in (hosted mode)

```sh
dirgha login          # opens your browser for a device-flow handshake
dirgha status         # shows your account, quota, session count
```

Your token is saved under `~/.dirgha/credentials.json` (0600). Unset
with `dirgha logout`.

---

## 2. Bring your own key (BYOK)

Skip login entirely. Set one provider env var and `dirgha status`
will report "BYOK ready":

```sh
export ANTHROPIC_API_KEY=sk-ant-...
# or: OPENAI_API_KEY, OPENROUTER_API_KEY, NVIDIA_API_KEY,
#     FIREWORKS_API_KEY, GROQ_API_KEY, GEMINI_API_KEY,
#     MISTRAL_API_KEY

dirgha                # launch REPL with the detected provider
```

`dirgha keys list` shows saved keys.

---

## 3. One-shot prompt from the shell

```sh
dirgha ask "explain the async guards in src/tools/file.ts"
```

Prints the answer and exits. No REPL, no tool calls, no session
persistence.

---

## 4. Full agent mode

```sh
dirgha                # REPL with tool use, streaming, slash commands
```

Inside the REPL:
- `/help` — command overview
- `/yolo --enable medium` — auto-approve everything except dangerous
  shell commands
- `/compact` — summarize the current context to make room
- `/quit`

---

## 5. Persistent sessions

Every REPL invocation gets a session. Fork and resume:

```sh
dirgha session list
dirgha session fork main migrate-auth
dirgha session create migrate-auth
dirgha           # now runs inside the `migrate-auth` session
```

Sessions carry memory + conversation history. Forks copy the parent's
state at the branch point.

---

## 6. Memory — remember and recall

```sh
dirgha remember "Use JWT with RS256 for auth, kid rotation quarterly"
dirgha recall "auth"
dirgha ctx "auth"     # show top memories the model would see
```

Memory is scoped per session; promote to project-level with
`session-start <project-id>`.

---

## 7. Checkpoint before a risky edit

```sh
dirgha checkpoint save before-refactor
# ... agent makes changes ...
dirgha checkpoint list
dirgha rollback before-refactor   # restore the shadow-git snapshot
```

Checkpoints are a separate shadow git repo under `~/.dirgha/shadow/`
so they don't pollute your project's git history.

---

## 8. Fleet — parallel agents in worktrees

```sh
dirgha fleet launch "migrate auth to JWT + add rate limiter"
# → decomposes into parallel streams, each in its own worktree:
#    fleet/auth-middleware, fleet/jwt-service, fleet/rate-limiter
```

When they're done, review each with `git diff fleet/<name>..main`.
Cancel with `dirgha fleet cancel <id>`.

---

## 9. Switch models

```sh
dirgha models list
dirgha models switch anthropic/claude-opus-4-7
dirgha models recommend coding     # suggests by task
dirgha models health               # verifies gateway reachable
```

Per-invocation override:

```sh
DIRGHA_MODEL=nvidia/minimax-m2.7 dirgha ask "quick hello"
```

---

## 10. Plug in an MCP server

Dirgha Code speaks the Model Context Protocol both ways.

Install a server:

```sh
dirgha mcp add filesystem-server npx @mcp/server-filesystem ~/projects
dirgha mcp list
```

Or run Dirgha itself as an MCP server (use it from Claude Desktop,
Cursor, etc.):

```sh
dirgha mcp serve     # stdio server; add to your client config
```

---

## Flags that matter

| Flag | Effect |
|---|---|
| `--json` | Machine-readable output on every command (CLI-Anything) |
| `--dangerously-skip-permissions` | Bypass every confirmation dialog (still blocks dangerous shell commands) |
| `DIRGHA_EXPERIMENTAL=1` | Unhide experimental commands (mesh, swarm, voice, dao, make, bucky) |
| `DIRGHA_MODEL=<id>` | Override the active model for one invocation |
| `DIRGHA_API_URL=<url>` | Point at a private gateway instead of api.dirgha.ai |
| `DIRGHA_WORKSPACE_ROOT=<dir>` | Restrict the file sandbox to this directory |

See `docs/SECURITY.md` for what each sandbox actually guarantees.
