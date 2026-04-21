# Getting help

Before opening an issue, please use the channel that matches your question.

## Documentation first

Most "how do I…" questions are answered in the docs. Quick links:

- [Quickstart](docs/QUICKSTART.md) — install and first prompt in five minutes.
- [User guide](docs/USER_GUIDE.md) — configuration, providers, models, sessions.
- [Architecture](docs/ARCHITECTURE.md) — how the pieces fit together.
- [API reference](docs/API_REFERENCE.md) — tools, schemas, return types.
- [Examples](docs/EXAMPLES.md) — common workflows, copy-pasteable.

## Where to ask

| I want to… | Go here |
|---|---|
| Ask "how do I…" or "does Dirgha support…" | [GitHub Discussions](https://github.com/dirghaai/dirgha-code/discussions) |
| Share a tip, setup, or workflow | [Discussions — Show and tell](https://github.com/dirghaai/dirgha-code/discussions/categories/show-and-tell) |
| Report a bug | [Open an issue → Bug report](https://github.com/dirghaai/dirgha-code/issues/new?template=bug.md) |
| Request a feature | [Open an issue → Feature request](https://github.com/dirghaai/dirgha-code/issues/new?template=feature.md) |
| Report a security vulnerability | See [SECURITY.md](SECURITY.md) — **do not** use public issues |
| Talk about commercial / enterprise use | `enterprise@dirgha.ai` |
| Press, partnerships, general questions | `hello@dirgha.ai` |

## Response times

These are targets, not guarantees, unless you have a commercial agreement.

- Security reports: acknowledged within 24 hours (business days).
- Bug reports: triaged within one week.
- Feature requests: reviewed at least monthly.
- Discussions: community-answered; maintainers chime in when they have time.
- Enterprise support: per your contract.

## Before you open an issue

- Search existing issues and Discussions first — there's a good chance someone hit the same thing.
- Reproduce on the latest release (`npm install -g @dirgha/code` or `pnpm update`).
- Include version, OS, Node version, provider, and model.
- Redact API keys and any secrets from your logs.

## What will not get a fast response

- "Please add support for <paid provider X>" with no BYOK key or test account to validate against.
- "The model said something wrong" — that's a provider issue; try a different model.
- Bug reports without reproduction steps.
- Issues opened as "critical" with no impact description.

## Commercial support

For on-premise deployment, custom tools, integrations, SLAs, or indemnification, contact `enterprise@dirgha.ai`.
