# Safety model

Dirgha assumes an agent will sometimes try to do the wrong thing, by mistake or because something it read told it to. So every action passes a check before it runs, and the check fails closed.

## The gate

The gate is built from `crates/lokahi-gate` into a WebAssembly module (`extensions/firefox-mv3/lokahi_gate.wasm`). The TypeScript agent loads it in `src/safety/policy.ts`, the Rust kernel calls it directly, and the browser extension runs it in the browser.

It screens each proposed action for:

- dangerous shell commands, including reordered flags and base64-wrapped commands;
- file paths outside what the task should touch;
- secrets and tokens in arguments;
- requests to cloud metadata addresses and other risky network targets;
- robot joint speeds above the configured limit.

### Fail closed

If the gate file is missing, fails to load, throws, or returns anything other than a clear answer, the call is refused with `lokahi_gate_unavailable`. For local development only, `DIRGHA_ALLOW_UNGATED=1` disables this and prints a warning on every call.

## Safety classes

| Class | Meaning | Rule |
|---|---|---|
| `S0ReadOnly` | Reads and observation | Checked by the gate |
| `S1Simulation` | Changes inside a simulation or sandbox | Checked by the gate |
| `S2HardwareOrCritical` | Irreversible or physical actions | Refused unless it carries a valid approver signature |

### S2 approvals

An S2 action is allowed only with an Ed25519 signature over the exact action, from a public key listed in `DIRGHA_APPROVER_PUBLIC_KEYS`. The request's own `human_signature_verified` flag is ignored, so an agent cannot approve itself. The gate measures the 45-second approval window itself; if no valid approval arrives in time, the action is refused.

## The ledger

Gate decisions are appended to a hash-chained ledger signed with Ed25519. Keys are random, never derived from paths. Verification uses a public key you trust (`DIRGHA_AUDIT_TRUSTED_PUBLIC_KEY`), not a key stored inside the ledger, so an edited entry fails verification.

## The cockpit

`dirgha cockpit` serves a local web page and an API on `127.0.0.1`. Every `/api/*` route needs a bearer token, printed once when the cockpit starts (or set with `--cockpit-token` / `DIRGHA_COCKPIT_TOKEN`). It sends no cross-origin headers, so other websites cannot call it. It refuses to listen on a non-local address unless you set a token yourself.

## Privacy

- Telemetry is off unless you run `dirgha telemetry enable`. See [privacy/CLI-TELEMETRY.md](privacy/CLI-TELEMETRY.md).
- `privacy_mask_text` replaces keys and personal data with placeholders before text goes to a hosted model.
- Memory, sessions, keys and logs stay under `~/.dirgha/`.

## Limits

- The gate is a first-pass filter built on patterns. It will miss some harmful actions and block some harmless ones.
- It checks what an agent asks to do, not what tools send back.
- Nothing here has been independently security-reviewed.

## Going further: LOKAHI

For rules a team writes and signs, approvals that must come from separate people, and evidence packs an auditor can verify offline, use [LOKAHI](https://github.com/Dirgha-AI/lokahi) (`pip install lokahi`). Dirgha's roadmap replaces the built-in gate's rules with LOKAHI's reference rules, tested against the same conformance suite.

Report vulnerabilities to security@dirgha.ai ([SECURITY.md](../SECURITY.md)).
