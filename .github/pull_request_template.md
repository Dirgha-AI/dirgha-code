<!--
Thanks for contributing to Dirgha Code.

Before opening this PR, please:

1. Read CONTRIBUTING.md for the DCO, CLA, and commit conventions.
2. Keep the change focused — one concern per PR.
3. Make sure `pnpm test` and `pnpm lint` are green locally.
4. Sign your commits (`git commit -s`).
-->

## What changed

<!-- One or two sentences describing the change. -->

## Why

<!-- What problem does this solve, or what capability does it unlock? Link the issue if any: "Closes #123". -->

## Blast radius

<!-- Which slices does this touch? Any cross-cutting concerns? -->

- [ ] Narrow — single file or slice
- [ ] Medium — multiple slices but contained
- [ ] Wide — touches the agent loop, dispatch, or public API

## Testing

<!-- How did you verify the change? Include commands and output if relevant. -->

- [ ] `pnpm test` passes locally
- [ ] `pnpm lint` passes locally (`tsc --noEmit`)
- [ ] Added or updated tests for the changed behavior
- [ ] Manually smoke-tested (`dirgha` REPL or `-p` mode)

## Checklist

- [ ] Commits are signed (`git commit -s`) with a DCO line
- [ ] If this is my first PR, my CLA is on file
- [ ] No secrets, API keys, or personal data in the diff
- [ ] Did not touch `src/tui/App.tsx` unless explicitly needed (see `src/README.md`)
- [ ] Updated CHANGELOG.md under `## [Unreleased]` if user-visible

## Screenshots / transcripts (optional)

<!-- For TUI or UX changes, a short transcript or before/after screenshot helps a lot. -->
