# Security Policy & Generative AI Transparency Disclosure

## 1. Reporting a Vulnerability

Please **do not** report security vulnerabilities through public GitHub issues.
Report vulnerabilities privately to:
- **Salik Shah:** `security@dirgha.ai`
- **Sabin Ranjit:** external security contributor

We acknowledge vulnerability reports within **48 hours** and provide a deterministic remediation patch and CVE/CSAF advisory within **14 days**.

## 2. Cryptographic & Runtime Security Invariants

1. **Pre-Execution WASM Firewall (`crates/lokahi-gate`):** Every tool call, browser action, and subprocess command is evaluated in `<1 ms` against 15 normative software/web rules plus 3 Physical AI (`S0`/`S1`/`S2`) rules.
2. **Rule 14 (Ahimsa 45-Second Timeout):** High-privilege (`S2`) actions—including payment checkouts, credential autofill, destructive filesystem operations, and physical robot hardware commands—require a verified human approval within 45 seconds. Silence equals refusal (`DENY_TIMEOUT`).
3. **Zero-Exposure Credential Handling (`PrivacyFlow` + OS Keychain Vault):** Secrets and PII are replaced locally with `<SECRET_HANDLE_01>` before any cloud LLM request is transmitted. Saved credentials reside in an `AES-256-GCM` SQLite table sealed by the host OS keychain (Windows DPAPI, macOS Keychain, Linux `secret-tool`) and are only autofilled after verifying the active page's exact origin.
4. **Generation-Bound DOM Integrity:** Browser actions require a matching `(generation, idx)` pair and `BLAKE3` DOM digest; stale DOM references fail closed (`STALE_DOM_GENERATION`).

## 3. Generative AI Policy & Provenance Disclosure (NLnet GenAI Policy v2.0 Compliance)

In accordance with the **NLnet Foundation Generative AI Policy v2.0 (October 20, 2026)**:
- All security, capability-sandbox, and supply-chain crates (`crates/lokahi-gate`, `crates/arniko-audit`, `crates/dirgha-core`, `crates/native-host`) and our deterministic `tree-sitter` AST remediation rules are reviewed, tested, and maintained by human engineers.
- Automated AST fixes synthesized by `crates/arniko-audit` are **100% deterministic symbolic rewrites** and never invoke generative AI models.
- Any contributor using an AI assistant for read-only code review or inside higher-level experimental plugins must disclose the model and version in the git commit trailer (`Assisted-by:`).
