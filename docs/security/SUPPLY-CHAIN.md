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
