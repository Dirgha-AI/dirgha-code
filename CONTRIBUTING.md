# Contributing to Dirgha Code

Thanks for wanting to help make Dirgha Code better. Here's what you need
to know before you open a PR.

## Before your first PR

1. **Read the [CLA](CLA.md).** Every contributor signs it. Contributions are
   assigned to Dirgha LLC so we can keep the project coherent and
   relicensable as the product grows. This is standard for a commercial
   open-source project. If you're contributing for a company, make sure
   you have authority to sign on its behalf.

2. **Sign the CLA.** Open your PR with this line in the description:

   > I have read and agree to the Dirgha AI Contributor License Agreement
   > at CLA.md, and I submit this Contribution under those terms.

   That's it — no external forms, no DocuSign. We'll record your name in
   `CONTRIBUTORS.md` on merge.

3. **Read the [LICENSE](LICENSE).** Dirgha Code is released under the
   Functional Source License 1.1 (MIT Future License). Your contributions
   inherit that license and will convert to MIT two years after the
   release they ship in.

## How to contribute

### Bugs and feature requests

Open an issue. Include:
- What you expected
- What actually happened
- Reproduction steps, OS, Node version, Dirgha version (`dirgha --version`)
- Relevant output from `DIRGHA_DEBUG=1 dirgha ...` if it's a runtime bug

### Pull requests

- Branch from `main`
- Keep changes focused — one PR per concern
- Run `npm test` before pushing
- Run `npm run lint` (`tsc --noEmit`) — the build must type-check
- Include a short description of what the change does and why
- Reference the issue number if there is one (`Fixes #123`)

### Code style

- TypeScript strict mode
- No new dependencies without justification in the PR description
- No emoji in code unless explicitly requested
- Comments explain **why**, not **what** — well-named code documents itself
- Don't add error handling for scenarios that can't happen
- Default to fewer abstractions, not more

## Scope — what belongs here

**Belongs in `@dirgha/code`:**
- Terminal UI improvements
- LLM provider integrations (new providers, streaming, tool calling)
- Agent-mode headless command surface
- CLI-Hub plugin infrastructure
- Tools (read/write/edit/search/bash/etc.)
- Performance, reliability, stability

**Does not belong here:**
- Billing, quota enforcement, user management — those live in the Dirgha
  Gateway (not open source)
- Web/mobile UI — separate repos
- Model weights — those are upstream at the provider

## Releases

Maintainers handle publishing. We follow [semantic versioning](https://semver.org/)
strictly:

- **PATCH** (`1.5.1 → 1.5.2`) — bug fixes, copy tweaks, internal refactors,
  dependency bumps. No user-visible behavior change. Bump freely; expect
  high patch numbers.
- **MINOR** (`1.5.x → 1.6.0`) — new commands, new flags, new features.
  Existing flows continue to work the same.
- **MAJOR** (`1.x → 2.0`) — a CLI contract changed: a flag was renamed,
  a command removed, a config-file shape altered, or a default behavior
  changed in a way that could surprise an existing user.

If your PR doesn't add a new user-facing capability, it's a patch.
We expect to live on `1.x` for a long time.

## Questions

- Issues: https://github.com/dirghaai/dirgha-code/issues
- Email: team@dirgha.ai

Made with care in Delhi · Patan · everywhere.
