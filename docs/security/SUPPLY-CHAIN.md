# Supply-chain hardening — current state

**Last updated**: 2026-04-28 (CI-9 hardening landed alongside CI-8)

This is a one-page audit of the controls Dirgha Code has in place to prevent supply-chain attacks against its release artefacts and against the developers contributing to it. For vulnerability *reporting*, see `SECURITY.md`.

## Threat model

The CLI ships:
- A signed npm tarball (`@dirgha/code`) consumed by users globally
- Source code on GitHub (`Dirgha-AI/dirgha-code`)
- Telemetry events to a Posthog endpoint (when opt-in)
- Crash reports to the same endpoint (when opt-in)

The most consequential attack would be: an attacker pushes a malicious version of the CLI to npm under our name. Users pulling `@dirgha/code@latest` would then run the attacker's code with their environment, their tools, their API keys, their files.

The controls below collectively raise the bar so that this attack path requires compromising several independent systems simultaneously, not just one.

## Controls in place

### Author identity → repo

| Control | Status | Notes |
|---|---|---|
| Org-level SSO (where supported) | optional | Not required tonight; revisit at scale |
| Branch protection on `main` (1 reviewer, no force push, no delete, linear history, enforce admins) | settings-as-code in `.github/settings.yml` + `scripts/apply-branch-protection.sh`. Not yet active — runs on owner's go-ahead. |
| Required PR reviews | yes (planned, governed by branch protection) |
| `.github/CODEOWNERS` declaring sensitive paths | ✓ in place | Telemetry, auth, providers, CI/release tooling all owner-gated |
| Signed commits | optional today | Documented as a future ratchet — not requiring it yet because it would block contributors without GPG/SSH signing setup |
| Two-factor on the GitHub account | required by org policy |

### Push → repo (defense against credential theft)

| Control | Status |
|---|---|
| Secret-scanning | enabled — GitHub native |
| Secret-scanning push protection | enabled — pushes containing detected secrets are blocked |
| Dependabot version updates (npm + GH Actions, weekly grouped) | `.github/dependabot.yml` |
| Dependabot security updates | enabled — auto-PRs on CVE disclosure |
| OpenSSF Scorecard | weekly + on push, badge published to `scorecard.dev` |

### Repo → CI (defense against action hijacking)

| Control | Status |
|---|---|
| GitHub Actions pinned to commit SHAs (with major-version comment) | `publish.yml` (highest blast radius — id-token: write) ✓; other workflows still on major-version tags. Dependabot PR-bumps the SHA. |
| Workflow permissions: `read` by default | yes — only `publish.yml` and `release-please.yml` get write |
| `id-token: write` only on `publish.yml` and `scorecard.yml` | yes |
| OIDC authentication for npm publish (no NPM_TOKEN) | Trusted Publisher live since v1.7.7 |
| OIDC authentication for cosign (no signing keys to manage) | live since v1.7.14 |

### CI → npm (defense against tampered artefact)

| Control | Status |
|---|---|
| `npm audit --audit-level=high --omit=dev` is a release-blocking gate | ci.yml + publish.yml |
| `license-checker` rejects GPL/AGPL/LGPL transitive deps | ci.yml + publish.yml |
| Bundle-size budget (600 KB tarball) | publish.yml — exceed → fail tag |
| SBOM emitted in CycloneDX + SPDX formats | npm 11.5.1 native, both attached to the GitHub Release |
| SBOMs signed with cosign keyless OIDC | `.sig` + `.pem` files attached to the GitHub Release |
| npm package signed via Trusted Publisher provenance | every release since v1.7.7 |
| Pre-publish guard (`scripts/prepublish-guard.sh`) blocks dist drift | yes |
| `npm pack` + global install + non-interactive smoke run BEFORE the publish step | yes — catches packaging breakage |
| Headless Ink unit tests (release-blocking) | 39 cells |
| Multi-agent UX scorer (release-blocking, threshold ≥ 7.0) | runs against the just-built tarball |
| Cross-OS matrix (ubuntu × macos × windows × Node 20/22) | green required |

### npm → user

| Control | Status |
|---|---|
| Users verify provenance with `npm audit signatures` | works today (no setup needed) |
| Users verify SBOM provenance with `cosign verify-blob` | one-line shell command in the release notes |
| `dirgha update --check` reads the npm registry; users see version comparison before upgrading | yes |
| First-run telemetry consent prompt (default OFF) | yes |
| Telemetry payload is documented in `docs/privacy/CLI-TELEMETRY.md` | exact 5-field schema |

## Verifying a release as a downstream user

```bash
# 1. Verify the npm package's signature + provenance
npm audit signatures @dirgha/code

# 2. Download the SBOM + signatures from the GitHub Release
gh release download v1.7.14 --repo Dirgha-AI/dirgha-code --pattern 'sbom.*'

# 3. Verify the cosign signature on the CycloneDX SBOM
cosign verify-blob \
  --certificate-identity-regexp 'https://github.com/Dirgha-AI/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --signature sbom.cdx.json.sig \
  --certificate sbom.cdx.json.pem \
  sbom.cdx.json

# 4. Inspect the SBOM contents
jq '.components | length' sbom.cdx.json
```

## What's still on the roadmap (CI-10+)

These would close us further toward SLSA Level 3, but each has a maintenance cost worth weighing:

- **Pin every action to a SHA** (currently only `publish.yml`). Dependabot already opens these as PRs.
- **Require signed commits** on `main`. Blocks contributors without GPG/SSH signing — wait until project is bigger.
- **CodeQL static analysis** weekly. Free for public repos; would need allow-listing or separate workflow.
- **Reproducible builds** — same input, same `dirgha-code-X.Y.Z.tgz` byte-for-byte. Hard with npm; possible with deterministic timestamps.
- **OIDC-bound `id-token: write` to specific workflows only** via repo `actions/permissions`. Already restricted.

## Audit trail of every release

- `CHANGELOG.md` — what changed in human-readable form
- `git log v<a>..v<b>` — every commit
- GitHub Release page — auto-generated PR list + the SBOMs
- `~/.dirgha/audit/` (local on every user's machine) — every event the CLI emitted, including auto-update timestamps and crash-report sends
- Posthog (when telemetry opt-in) — version adoption + error class rates

## Vendored third-party binaries (added 2026-05-02)

### rtk v0.34.1 (Rust Token Killer)

**Source**: https://github.com/rtk-ai/rtk  
**License**: MIT  
**Vendored at**: `vendor/rtk/linux-x64/rtk`  
**SHA256**: `2ba0e2a5bf68e271190ace5f1be404b0b82ab9776efd19f1eace5376dbf74cc6`  
**Integrity manifest**: `vendor/rtk/CHECKSUMS.txt`

**Security audit findings** (2026-05-02):
- **Telemetry on by default**: pings `https://telemetry.rtk-ai.app/ping` with salted device hash + aggregate command counts. No credentials, paths, or file content sent. Opt-out: `RTK_TELEMETRY_DISABLED=1`. **Dirgha sets this env var automatically** — users are not enrolled.
- **Env var display**: `rtk env` subcommand masks sensitive env vars (GH_TOKEN, etc.) — does not forward them outbound.
- **Filesystem**: reads `/proc/self/exe`, `/etc/resolv.conf` (stdlib/TLS). No credential store reads.
- **No reproducible build**: upstream checksums cover tarballs, not raw binaries. Binary is stripped.
- **Verdict**: CAUTION — not malicious, telemetry mitigated by env var, document for users.

**Mitigations applied**:
1. `RTK_TELEMETRY_DISABLED=1` injected into every rtk subprocess env.
2. SHA256 in `vendor/rtk/CHECKSUMS.txt` for version pinning.
3. All version ranges removed from package.json (`^` stripped).

### @tobilu/qmd v0.9.0

**Source**: https://github.com/tobi/qmd  
**License**: MIT  
**Bundled as**: npm dependency (exact version `0.9.0`, no semver range)

**Security audit findings** (2026-05-02, full source scan of `qmd.ts`, `store.ts`, `llm.ts`, `collections.ts`, `mcp.ts`, `formatter.ts`):

**Data exfiltration / telemetry**: CLEAN.
Zero telemetry, analytics, or beacon endpoints.
Only legitimate outbound call: `llm.ts:212` — a HEAD request to `huggingface.co` only when the user explicitly runs `qmd pull hf:…`; no user content is sent.
`mcp.ts:591` binds to `localhost` only.

**Dangerous APIs**:
- HIGH: `qmd.ts:396` — `Bun.spawn(["/usr/bin/env", "bash", "-c", yamlCol.update])`.
  `yamlCol.update` is a string from the user's own `~/.config/qmd/index.yml`.
  If the config file is symlink-hijacked or written by another process, arbitrary shell commands execute.
  Not injected by Dirgha — risk is in the qmd config, not in Dirgha's use of the tool.
- All other `spawn` calls use hardcoded argument arrays. No `eval`, `new Function`, `execSync`, or dynamic `import` of user strings.

**Environment variable harvesting**: CLEAN.
Reads: `NO_COLOR`, `XDG_CACHE_HOME`, `HOME`, `PWD`, `INDEX_PATH`, `QMD_CONFIG_DIR`, `BREW_PREFIX`.
None are secrets. None are sent outbound.

**Filesystem access**: CLEAN.
Reads and writes only under `~/.config/qmd/` and `~/.cache/qmd/` plus user-configured collection directories.
`store.ts:447` uses `realpathSync` — no path traversal risk.

**Runtime compatibility**: CRITICAL (addressed).
Package requires Bun runtime — `bun:sqlite`, `Bun.CryptoHasher`, `Bun.spawnSync`, `Bun.argv` all crash in Node.js.
No `main` / `exports` field — `import('@tobilu/qmd')` throws `ERR_MODULE_NOT_FOUND` in Node.js.
**Mitigation**: `src/tools/qmd.ts` uses `execFile("qmd", …)` subprocess only; no JS import is ever attempted.

**Dependency risk (highest to lowest)**:

| Dep | Version | Risk |
|---|---|---|
| `node-llama-cpp` | `^3.14.5` | **HIGH** — postinstall (`node ./dist/cli/cli.js postinstall`) downloads prebuilt llama.cpp native binaries from GitHub Releases over HTTPS. Floating `^` range means a minor bump changes the binary. No integrity hash pinning. |
| `@modelcontextprotocol/sdk` | `^1.25.1` | MEDIUM — floating `^`, large dep tree (hono, jose, eventsource). No install hook. |
| `sqlite-vec` | `^0.1.7-alpha.2` | MEDIUM — alpha channel, floating `^`, native addon. No install hook. |
| `@types/bun` | `latest` | MEDIUM — fully unpinned. Dev-only types. |
| `yaml` | `^2.8.2` | LOW |
| `zod` | `^4.2.1` | LOW |

**Install-time network calls**: `node-llama-cpp` is the only dependency that makes network calls at `npm install` time.
`@tobilu/qmd` itself has no `preinstall`/`postinstall` hook.

**Overall verdict**: No malicious code, no telemetry, no credential harvesting.
Primary risks: (1) Bun-only — mitigated by subprocess-only invocation; (2) `node-llama-cpp` postinstall downloads unsigned native binaries.

**Mitigations applied**:
1. JS import path removed from `src/tools/qmd.ts` — CLI subprocess only (`execFile("qmd", …)`).
2. Exact version `0.9.0` pinned in `package.json` (no `^`).
3. `node-llama-cpp` risk documented here; upgrade only after manual SHA verification of the new binary.
4. `src/types/tobilu__qmd.d.ts` type stub satisfies TypeScript without importing the package at runtime.
