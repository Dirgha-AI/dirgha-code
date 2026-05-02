# Dirgha Tutorial: Subagents for Complex Tasks

**Time:** 10 minutes
**Prerequisites:** Dirgha CLI installed, basic familiarity with the REPL

## What are subagents?

Dirgha can spawn **subagents** — child AI agents that handle subtasks in
isolation. Each subagent gets its own context window, tools, and instruction
set. The parent agent delegates work and consolidates results.

Use subagents when:

- A task has multiple independent subtasks
- You want parallel exploration of different approaches
- A subtask shouldn't pollute the main context window (long file edits,
  complex searches)

## How subagents work

```
┌─────────────────────┐
│   Parent Agent      │
│   "Refactor auth"   │
└──┬────────┬─────────┘
   │        │
   ▼        ▼
┌─────┐ ┌─────┐
│Subag│ │Subag│
│ent 1│ │ent 2│
│types│ │tests│
└─────┘ └─────┘
```

## Step 1: Request subagent delegation

In the Dirgha REPL, tell the main agent to use subagents:

```
You: Refactor the auth module — add types, write tests,
     and update the README. Use subagents.
```

Dirgha will:

1. Break the task into 3 subtasks (types, tests, docs)
2. Spawn 3 subagents in parallel
3. Each subagent works independently
4. Results are consolidated and presented to you

## Step 2: Manual subagent launch

For finer control, use the `/subagent` slash command:

```
/subagent "Add TypeScript types to src/auth/*.ts" --max-turns 10
/subagent "Write vitest tests for src/auth/" --max-turns 15
```

Each subagent runs in its own context. You'll see status updates in the status bar.

## Step 3: Review subagent results

When a subagent finishes, its output is appended to the chat:

```
Subagent 1 (types) finished — modified 3 files:
  src/auth/types.ts    (+45 lines)
  src/auth/middleware.ts (+12 lines)
  src/auth/index.ts    (+8 lines)

Subagent 2 (tests) finished — created 1 file:
  src/auth/__tests__/auth.test.ts (+120 lines)
```

Review the changes with `git diff` before committing.

## Advanced: Subagent pools

For batch operations, Dirgha can maintain a pool of reusable subagents:

```
You: Scan every file in src/routes/ and add error boundaries.
     Use subagent pool with 4 agents.
```

The pool manager (in `src/subagents/pool.ts`) reuses agent sessions for
subsequent tasks, reducing LLM cost since context is shared.

## Loop detection

Dirgha's subagent system includes loop detection (`src/subagents/loop-detector.ts`).
If a subagent gets stuck retrying the same fix, it's killed automatically:

```
Subagent 3 killed: loop detected (5 successive identical fix attempts)
```

The parent agent then reassigns the task or reports the failure.

## Configuration

Subagent behavior is configurable in `~/.dirgha/subagents.json`:

```json
{
  "maxConcurrent": 4,
  "defaultMaxTurns": 15,
  "loopDetectionThreshold": 5,
  "autoKillOnLoop": true
}
```

## Next steps

- See [fleet tutorial](./fleet.md) for project-level parallel agents
- See [init tutorial](./init.md) for project setup
- Read the [subagent architecture](../architecture.md#subagents)
