# Dirgha CLI — Telemetry Privacy

**Effective date**: 2026-04-28
**Audience**: any user of `@dirgha/code`
**Scope**: anonymous usage telemetry + opt-in crash reports

## TL;DR

- **Telemetry is OFF by default.** Nothing is sent until you explicitly opt in.
- **We never send**: prompts, model responses, file contents, API keys, OS usernames, file paths inside your home dir.
- **We may send (only if enabled)**: CLI version, OS family (linux/macos/windows), Node version, error class names (no stacktraces).
- **Crash reports are a separate prompt** that fires only when `dirgha doctor --send-crash-report` is run by you.
- You can disable telemetry at any time with `dirgha telemetry disable`.

## What we send (when enabled) — the *minimum* possible

Each ping is a single HTTP POST to `${DIRGHA_TELEMETRY_URL}` (defaults to Posthog Cloud). The body contains exactly these fields and no others:

| Field | Example | Why we need it |
|---|---|---|
| `event` | `"cli_command"` or `"cli_error"` | Tells us what kind of ping this is |
| `version` | `"1.7.12"` | To detect when a release regresses |
| `command` | `"ask"`, `"doctor"`, `"telemetry"` | To know which features are used |
| `os` | `"linux"`, `"macos"`, or `"win"` | OS-specific bug triage. Coarse — never a kernel version. |
| `node` | `"v22"`, `"v20"` | Major only. Never the patch version. |
| `error_class` | `"TypeError"`, `"AbortError"` | **Only on error events.** No message, no stack. |
| `distinct_id` | hash of session id (16 hex) | Counts unique users. |

**Six fields** (five for command events, six for error events). That's it. We deliberately do NOT send:

- `os_release` (kernel version) — too granular, fingerprintable
- `arch` (x64 / arm64) — useful for arm64 bugs but rare; ask via `doctor` if needed
- `duration_ms` — interesting but not crucial for v1
- IP, hostname, MAC address, machine UUID, hardware fingerprint — all NEVER

`distinct_id` is `sha256(sessionId).slice(0, 16)`. The session id itself never leaves the machine — only the hash does.

We use the metric to:
- Detect when a release is regressing (e.g. version X has 5× the error rate of version X-1)
- Prioritize feature work (which commands matter most)
- Track adoption (downloads × DAU)

## What we do NOT send

- Prompts you type into the REPL
- Model responses (text, thinking, tool args, tool output)
- File contents read or written by tools
- API keys (Anthropic/OpenAI/etc.)
- File paths if they include your home directory or username
- Per-call cost or token counts

## Opt-in flow

When you first run `dirgha` after upgrading to a version that ships telemetry, you see a one-screen consent prompt:

```
  ╭──────────────────────────────────────────────────────────╮
  │ Anonymous usage telemetry?                              │
  │                                                          │
  │ Help us catch regressions by sending: CLI version, OS,  │
  │ Node version, command names, error class names.         │
  │                                                          │
  │ We never send: prompts, responses, file contents, keys. │
  │                                                          │
  │ [y]es / [n]o / [r]ead full policy                       │
  ╰──────────────────────────────────────────────────────────╯
```

Default answer (Enter): **no**. The choice is persisted to `~/.dirgha/config.json` under `telemetry.enabled`.

## Commands

```bash
dirgha telemetry status     # Show: enabled? endpoint? session_id (last 8 chars)
dirgha telemetry enable     # Opt in
dirgha telemetry disable    # Opt out (default)
dirgha telemetry endpoint <url>   # Override endpoint (e.g. for self-hosted Posthog)
```

## Crash reports

`dirgha doctor --send-crash-report` is the explicit one-time crash report flow. It bundles:
- The most recent `~/.dirgha/audit/*.jsonl` entries
- Stacktrace from the last failed run
- Output of `dirgha doctor` (sanitised — masks env vars whose names contain `KEY`, `TOKEN`, `SECRET`)

You see the bundle preview before it sends. Cancel before submit and nothing leaves the machine.

## Self-hosted

If you run a corporate Posthog (or any OpenTelemetry-compatible endpoint), point the CLI at it:

```bash
dirgha telemetry endpoint https://posthog.your-corp.example/capture
dirgha telemetry enable
```

The default endpoint is `https://t.dirgha.ai/v1/cli` (Posthog Cloud, hosted by Dirgha LLC). Wyoming, US jurisdiction.

## Retention

- Anonymous events: **90 days** rolling, then aggregated into version-level metrics and the per-event row deleted.
- Crash bundles: **30 days** if you used `--send-crash-report`. Always deleted after the linked GitHub issue is closed.

## Compliance

- Dirgha LLC, Wyoming, USA — governing law for our processing
- We do not knowingly collect data from users under 13 (COPPA)
- EU users: lawful basis is consent (GDPR Art. 6(1)(a)); withdraw at any time via `dirgha telemetry disable`
- India users: comply with DPDP 2023 — consent-based processing, deletion on request to `privacy@dirgha.ai`

## Source

This document, the prompt copy, and the telemetry sender are open-source and live in the public Dirgha-AI/dirgha-code repository. Audit it: `tools/telemetry/`.
