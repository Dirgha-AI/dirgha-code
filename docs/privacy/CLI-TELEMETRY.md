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

## What we send (when enabled)

Each ping is a single HTTP POST to `${DIRGHA_TELEMETRY_URL}` (defaults to a Posthog-compatible endpoint). The body contains:

```json
{
  "event": "cli_use",
  "version": "1.7.11",
  "os": "linux",
  "node": "22.22.2",
  "command": "ask",
  "session_id": "anon-2f3a91...",
  "ts": 1777366200
}
```

`session_id` is a random UUID generated once per install and stored at `~/.dirgha/telemetry-id`. It is NOT linked to any account, IP, or hardware identifier. Delete the file to reset.

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
