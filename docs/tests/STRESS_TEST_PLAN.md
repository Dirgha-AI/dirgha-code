# Dirgha CLI Stress Test Plan

> Auto-generated from live QA run on 2026-05-02. Run on v1.20.4.
> Model: deepseek-chat (DeepSeek direct API)

## Purpose

This document defines the canonical stress test matrix for the Dirgha CLI.
It covers every command surface, error recovery path, and long-horizon workflow.
Run this before every major release.

## Test Categories

### 1. Info Subcommands (no LLM required)
Tests for: dirgha --version, doctor, status, stats, keys list, models, audit, cost, memory, telemetry, hardware, history, state, update --check

Pass criteria: exit 0, no stack traces, meaningful output

Known issues:
- `dirgha stats` hangs on >100 session files (fixed in v1.20.4)
- `dirgha cost` crashes on stub-model audit entries (fixed in v1.20.4)

### 2. Interactive Slash Commands
Tests for: /help, /model, /mode (all 5 modes), /theme (all 4 themes), /cost, /skills, /session list/load/branch, /compact, /clear, /exit

Pass criteria: each responds within 2s, no "slash error:", /mode changes reflected in status bar

Known issues:
- `/session branch` not accessible (stub registered before builtin — fixed in v1.20.4)
- `/model <short-name>` rejected (alias resolution missing — fixed in v1.20.4)

### 3. LLM One-Shot Commands (dirgha ask)
Tests for: basic Q&A, --json mode, tool use (shell/read_file), --mode plan, --mode verify

Pass criteria: exit 0, correct tool calls fire, plan mode doesn't write files

### 4. Long-Horizon Multi-Turn (interactive REPL)
Tests: 10+ turn session, context compaction, model switching mid-session, /clear and resume

Pass criteria: history maintained, compaction fires automatically at 75% window, no ghost tool calls after /clear

### 5. Dev Sprint Workflow
Test: plan → read files → write code → build → test new command

Pass criteria: new command created and functional, plan mode blocks file writes

### 6. Error Recovery
Tests: bad model, shell exit non-zero, file not found, Ctrl-C mid-stream, empty input, concurrent sessions, large prompts

Pass criteria: graceful error messages, no zombie processes, non-zero exit on bad model

### 7. Mode Enforcement (kernel hooks)
Tests: PLAN mode blocks fs_write/shell/git, VERIFY same, ACT allows all, YOLO bypasses approval

Pass criteria: all 12 kernel unit assertions pass (see test_enforce.mjs)

### 8. audit-codebase subcommand
Tests: --help, --root on a directory with subdirectories, --model alias routing, synthesis output

Pass criteria: exit 0 on valid root, synthesis file written to docs/audits/, "No modules found" on leaf dirs

Known issues observed (2026-05-02 QA run):
- `--root src/kernel/` → "No modules found" (correct — kernel has no subdirectories, only .ts files)
- All 29 sub-agents fail when `deepseek-chat` is not a recognized internal alias; synthesis still exits 0
- `integrations` module took 304s vs ~15s average — outlier, likely large directory depth
- Partials directory created but empty when sub-agents fail before writing output

### 9. dirgha chat subcommand
Tests: --help, one-shot prompt, model routing, JSON mode

Pass criteria: exit 0, response printed, model identified correctly

Known results (2026-05-02 QA run):
- `dirgha chat --help` exits 1 (usage printed to stderr — cosmetic issue)
- `dirgha chat "what model are you?"` exits 0, returns Kimi K2.5 response (default model)

## Running the Full Suite

### Quick smoke (5 min, no LLM)
```bash
# Info subcommands
dirgha --version
dirgha doctor
dirgha status
dirgha keys list
dirgha models

# audit-codebase help
dirgha audit-codebase --help

# Mode enforcement unit test
node scripts/test-enforce.mjs
```

### Full suite (30 min, requires LLM key)
```bash
export DEEPSEEK_API_KEY=<your-key>

# One-shot tests
dirgha ask --model deepseek-chat "what is 2+2"
dirgha ask --model deepseek-chat --json "say hello"
dirgha ask --model deepseek-chat "run ls /tmp"
dirgha ask --model deepseek-chat --mode plan "describe a file write plan"

# Verify mode enforcement
dirgha ask --model deepseek-chat --mode verify "try to write to /tmp/test.txt"

# chat subcommand
dirgha chat "what model are you?"

# audit-codebase (use a directory with subdirectories)
dirgha audit-codebase --root src/ --concurrency 2 --max-turns 5 --model deepseek-chat

# Error paths
dirgha ask --model bad-model "hello"
dirgha ask --model deepseek-chat ""
```

### Stress test (1 hour, long-horizon)
```bash
# Multi-turn audit
DIRGHA_NO_INK=1 DIRGHA_MODEL=deepseek-chat dirgha
# inside REPL:
# > read src/kernel/agent-loop.ts and describe it
# > read src/context/mode-enforcement.ts too
# > what bugs could exist at the junction?
# /cost
# /exit
```

## Regression Checklist (before every release)

- [ ] `dirgha --version` shows correct semver
- [ ] `dirgha doctor` exits 0 (warnings OK, crashes not)
- [ ] `dirgha cost` exits 0 on a dirty audit log (stub-model entries)
- [ ] `dirgha stats` completes in < 15s
- [ ] `dirgha ask --model deepseek-chat "say hi"` returns a response
- [ ] Mode enforcement: all 12 kernel hook assertions pass
- [ ] `/session branch` reachable (not shadowed by stub)
- [ ] `/model <short-name>` accepted via alias lookup
- [ ] Ctrl-C during streaming: no zombie processes
- [ ] Concurrent sessions: no cross-contamination
- [ ] `npm run build` exits 0
- [ ] `bash scripts/prepublish-guard.sh` — all 11 checks pass
- [ ] `dirgha audit-codebase --root src/ --concurrency 2 --max-turns 5` exits 0
- [ ] `dirgha chat "hello"` exits 0 and returns a response

## Files

- Unit test: `node scripts/test-enforce.mjs` (mode enforcement)
- Prepublish gate: `bash scripts/prepublish-guard.sh`
- Smoke test: `bash scripts/tmux_smoke.sh` (if exists)
- Audit output: `docs/audits/AUDIT-<date>.md`
