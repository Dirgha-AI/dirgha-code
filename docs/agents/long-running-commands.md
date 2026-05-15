# Long-running shell commands

The `shell` tool has a `timeoutMs` parameter (default 120s).
Commands that exceed the timeout are killed (SIGTERM → SIGKILL).
There is no built-in background-job queue or resume mechanism.

## Pattern: background + poll

For work expected to run longer than `timeoutMs`:

1. Launch in the background with `nohup` and redirect output to a known temp file keyed by session ID.

```bash
nohup npm test > /tmp/dirgha-{sessionId}.out 2>&1 &
```

2. On the next turn, sleep a reasonable interval then read the output.

```bash
sleep 30 && cat /tmp/dirgha-{sessionId}.out
```

3. If the output is incomplete, loop: sleep and read again.
4. If the process is no longer running (`jobs -l` or `ps -p $PID`), read the final output.

## When to use sub-agents instead

For work that can be parallelised (e.g. "lint, test, typecheck all at once"),
delegate each slice to a sub-agent via the `task` tool with `maxTurns=1`.
Each sub-agent gets its own shell with its own timeout budget.

## Important

- All commands share the same filesystem — use unique temp-file paths per command.
- The temp directory `/tmp` is not cleaned up automatically — the agent should clean up after itself.
- Background processes run as the current user (`shell` uses `/bin/sh -c`).
- A disconnected session kills all processes that share the parent process tree.
  If you must survive disconnect, use `setsid`:

```bash
setsid sh -c 'nohup npm test > /tmp/dirgha-{sessionId}.out 2>&1 &'
```
