# Dirgha Code — Security model

> Reporting a vulnerability: see root `SECURITY.md`. This doc is the
> *technical* threat model and the sandbox guarantees the CLI makes.

## Threat model

Dirgha Code runs an LLM that proposes tool calls. The LLM is not
trusted. The tool layer is the only thing between the model and your
system, so its guarantees matter.

We defend against:

1. **Prompt injection in tool results** — a malicious webpage, file,
   or command output that tries to make the model take unauthorized
   actions.
2. **Symlink escapes from the workspace** — the LLM asking to read
   or write a file that resolves (through a symlink inside the
   workspace) to something outside.
3. **`..` path traversal** — the LLM asking to read `../../etc/passwd`.
4. **Dangerous shell commands** — the LLM proposing `rm -rf /`, a
   fork bomb, `curl ... | sh`, or any pattern on our DANGEROUS list.
5. **Tool escalation under degraded trust** — after we detect
   prompt injection in a tool result, the LLM trying to call tools
   it wouldn't normally have at a lower trust level.

We do **not** defend against:

1. A user who sets `--dangerously-skip-permissions` or
   `DIRGHA_YOLO=1` deliberately.
2. A user who has granted blanket `always_allow` for a tool and
   then encounters a prompt-injection attempt that uses exactly
   that tool.
3. A user running on a machine already compromised at the OS level.
4. Backdoored model providers. Use the gateway if you want that
   liability deferred to us.

## Sandboxing guarantees

### File sandbox (`src/tools/file.ts`)

`sandboxPath(inputPath)` resolves the path and then realpath's the
deepest extant ancestor. It rejects if the real path lands outside
the workspace root's real path.

Guarantees:

- A symlink inside the workspace that points outside → rejected.
- A symlinked directory that routes a deeper path outside → rejected.
- `..` in any component of the input → rejected.
- An absolute path that doesn't resolve back to inside the
  workspace → rejected.
- A new-file write in a symlinked directory pointing outside →
  rejected (the parent realpath is checked).

Tests: `src/tools/file.sandbox.test.ts` (21 cases).

### Shell sandbox (`src/tools/shell.ts`)

Two layers:

1. **Dangerous-pattern regex** — 37 patterns covering `rm -rf`,
   `mkfs`, `dd if=`, fork bombs, device writes, privilege
   escalation (`sudo`, `su -`), service kill (`systemctl stop`),
   git force operations, SQL DROP/TRUNCATE/DELETE, piped curl|sh,
   eval, kill/pkill, pm2 kill, docker rm -f, kubectl delete,
   terraform destroy, overwriting /etc/boot/usr/lib, iptables
   flush, password change.
2. **Safelist** — the base command (`ls`, `git`, `npm`, ...) must
   appear in `SAFE_COMMAND_BASES` (~55 entries). Anything else is
   rejected even if the dangerous-pattern check didn't fire.

Tests: `src/tools/shell-guards.spec.ts` (45 cases).

The `cd` built-in routes through `sandboxPath` — you can't `cd` out
of the workspace.

### LLM trust boundary (`src/agent/tool-execution.ts`)

Every tool result is scanned for prompt-injection markers:

- `ignore (all)? previous instructions.` (with sentence punctuation)
- `forget (your)? instructions and ...`
- `disregard (all)? previous (instructions|context)`
- `<<SYS>>` (Llama-specific)
- U+202E / U+202D bidirectional override characters

If any fires, the session's trust level downgrades to `untrusted`
and subsequent tool calls are restricted to `{read_file, ask_user}`.
The trust level auto-recovers to `high` after three consecutive
clean tool calls. Downgrade is silent; the wrapped content carries
a `[SECURITY: prompt injection detected in <tool> result — content
sanitized]` prefix and zero-width / HTML-comment / bidi chars are
stripped from the content that's passed back to the model.

Tests: `src/agent/tool-execution.test.ts` (26 cases).

### Permission system (`src/permission/judge.ts`)

Five trust levels, in order:

- `DangerFullAccess` — skips confirmation on everything except
  dangerous shell commands.
- `Allow` — same as above, narrower allowlist.
- `WorkspaceWrite` — skips confirmation for writes inside the
  workspace.
- `Prompt` — confirms every write.
- `ReadOnly` — confirms every write, many are still rejected.

Dangerous shell commands *always* prompt, regardless of trust
level. The only way to bypass them is `/yolo --enable all` or
`DIRGHA_YOLO=1` (which both require the user to type the specific
phrase).

Tests: `src/permission/judge.test.ts` (91 cases).

## What `--dangerously-skip-permissions` actually bypasses

It bypasses **confirmation dialogs only**. It does **not**:

- bypass the dangerous-pattern regex (`rm -rf /` still fails)
- bypass the shell safelist
- bypass the file sandbox or symlink realpath check
- bypass the LLM trust-level downgrade on injection detection

It **does**:

- auto-approve "always_allow" decisions without prompting you
- auto-approve write tools at `WorkspaceWrite` trust level
- skip the "Do you want to run X?" dialogs

Semantically equivalent to running with `/yolo --enable safe`.

## Data flow and secrets

- **Credentials** live at `~/.dirgha/credentials.json` with mode
  0600 and are never logged.
- **Crash reports** (`~/.dirgha/crash.log`) redact `$HOME` paths and
  scan for secret patterns (`sk-`, `nvapi-`, bearer tokens, etc.)
  before writing.
- **Telemetry** is off by default. Enabling it sends only tool-use
  counts and latency histograms — never prompts, never file contents.
- **Session state** stays in `~/.dirgha/sessions/`. Cloud sync is
  opt-in per session.

## Rough coverage summary

| Module | Tests | Coverage on the threat-model surface |
|---|---|---|
| `src/tools/file.ts` | 21 | Symlink escapes, traversal, absolute paths, unicode, edge cases |
| `src/tools/shell.ts` | 45 | 37 dangerous patterns + safelist + empty-input handling |
| `src/permission/judge.ts` | 91 | Every trust level × every tool class, dangerous-command special-casing |
| `src/agent/tool-execution.ts` | 26 | Prompt-injection markers, sanitization, trust downgrade |

Total on the threat-model surface: ~180 unit tests. Adding the
coarser pass rate: 767/777 on the full suite.

## Reporting guidelines

Short version: if you found a way to bypass any of the guarantees
above, it's a security bug — email `security@dirgha.ai` with
"SECURITY" in the subject. Full disclosure policy in the root
`SECURITY.md`.
