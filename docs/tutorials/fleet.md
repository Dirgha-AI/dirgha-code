# Dirgha Tutorial: Parallel Fleet Agents

**Time:** 15 minutes
**Prerequisites:** Git, Dirgha CLI installed (`npm install -g @dirgha/code`)

## Overview

Dirgha's **fleet** lets you spawn parallel AI agents in isolated git worktrees.
Each agent works on its own task independently — no stepping on each other's toes.

Use fleets when you have multiple independent features, bug fixes, or experiments
to run simultaneously.

## Step 1: Initialize your project

```bash
cd your-project
dirgha init
```

Dirgha reads `DIRGHA.md` (or `CLAUDE.md`) for project conventions. The init
command scaffolds one if it doesn't exist:

```
$ dirgha init
Wrote /home/you/your-project/DIRGHA.md
Found 3 relevant conventions in CLAUDE.md
```

## Step 2: Launch a fleet

The simplest fleet spawns agents from a task list:

```bash
dirgha fleet launch --tasks tasks.txt
```

Where `tasks.txt` is one task per line:

```
add TypeScript types to the auth module
write unit tests for the payment service
refactor the logger to use structured JSON
```

Each line becomes a parallel worktree agent. Dirgha:

1. Creates a git worktree under `.dirgha-worktrees/`
2. Runs a full agent session against the task
3. Reports results back to the coordinating agent

## Step 3: Monitor fleet progress

```bash
dirgha fleet status
```

Output:

```
Fleet: 3 agents (2 active, 1 done)
────────────────────────────────────
  agent-1  ACTIVE    add TypeScript types to auth
  agent-2  ACTIVE    write unit tests for payment service
  agent-3  DONE      refactor logger to use structured JSON
```

Use `dirgha fleet list` to see past fleets and their outcomes.

## Step 4: Review and merge

When agents complete, review their worktrees:

```bash
dirgha fleet review <fleet-id>
```

This shows a diff summary per agent. Merge the successful ones and discard
or retry the failures.

## Advanced: Tripleshot fleets

For harder tasks, use **tripleshot mode** — 3 agents attack the same task in
parallel with different approaches, then a judge agent picks the best result:

```bash
dirgha fleet launch --tripleshot --tasks complex-tasks.txt
```

## Clean up

```bash
dirgha fleet cleanup    # remove completed worktrees
```

## Next steps

- Read `dirgha fleet --help` for all options
- See [subagents tutorial](./subagents.md) for nested agent delegation
- Check the [benchmark dashboard](../benchmarks.md) for fleet performance data
