# Security policy

Thanks for helping keep Dirgha Code and its users safe.

## Reporting a vulnerability

Please **do not** file a public GitHub issue for security problems.

- Preferred: [private vulnerability report](https://github.com/dirghaai/dirgha-code/security/advisories/new) through GitHub's Security Advisories.
- Alternative: email `security@dirgha.ai` with the word `SECURITY` in the subject.

We will acknowledge within **24 hours** (business days) and aim to triage within **72 hours**. We will keep you informed through remediation and credit you in the advisory unless you prefer to remain anonymous.

## Scope

In scope:

- The `@dirgha/code` CLI and any code in this repository.
- The `api.dirgha.ai` gateway as used by the CLI (auth, credit handling, routing).
- Supply-chain issues in direct production dependencies declared in `package.json`.

Out of scope:

- Rate limits or availability of upstream model providers (report directly to the provider).
- Issues requiring a user to run a modified, forked, or untrusted build.
- Social-engineering attacks that rely on convincing a user to disclose their own API keys.
- Denial-of-service via provider rate limits.
- Vulnerabilities in example code under `docs/` or `examples/` that are explicitly for illustration.

## What counts as a security issue

High priority:

- Remote code execution or sandbox escape in the CLI.
- Prompt-injection vectors that cause the CLI to exfiltrate secrets, escalate tool permissions, or perform unconfirmed destructive actions.
- Credential leakage — logging, persistence, telemetry, or transmission of user API keys, session tokens, or file contents to unintended destinations.
- Auth bypass on the gateway (ability to consume credits without a valid session, or act as another user).
- Billing bypass (circumvent credit checks, forge webhook events).
- Supply-chain compromise (malicious version of a dependency we ship or pin).

Lower priority but still reportable:

- Privilege escalation in the permission system.
- TOCTOU or race conditions in file-lock handling.
- Insecure defaults in a supported configuration.

## Responsible disclosure

We ask that you:

- Give us reasonable time to remediate before public disclosure (90 days is typical; we will request longer only if the fix genuinely takes longer).
- Do not access or retain user data beyond what is needed to demonstrate the issue.
- Do not run destructive tests against production infrastructure — a minimal proof-of-concept is sufficient.

## Hall of fame

Contributors who report valid issues are credited in `THANKS.md` and in the GitHub Security Advisory, unless they opt out.

## PGP

If you need to encrypt your report, request a public key at `security@dirgha.ai`.
