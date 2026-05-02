# Support

## Start here

Run these two commands before anything else — they surface most problems without needing to file an issue:

```bash
dirgha doctor
dirgha setup --features
```

`dirgha doctor` checks your Node version, SQLite status, config file, and network connectivity, and prints a pass/warn/fail for each. `dirgha setup --features` repairs optional native dependencies (SQLite for chat history and session search) if they failed to install.

## Windows

If you're on Windows and hit installation issues, see the [Windows installation guide](./windows-installation.md). It covers VS Build Tools, PATH setup, and the most common error messages.

## Filing a bug report

Go to: **[github.com/Dirgha-AI/dirgha-code/issues](https://github.com/Dirgha-AI/dirgha-code/issues)**

A good bug report includes:

| Field | How to get it |
|---|---|
| Dirgha version | `dirgha --version` |
| OS and version | e.g., Windows 11 22H2, macOS 14.4, Ubuntu 24.04 |
| Node.js version | `node --version` |
| `dirgha doctor` output | paste the full output |
| Steps to reproduce | the exact commands you ran |
| Expected vs actual | what you expected, what happened |

Redact any API keys or secrets from logs before pasting.

## Where to ask questions

| I want to... | Go here |
|---|---|
| Ask "how do I..." | [GitHub Discussions](https://github.com/Dirgha-AI/dirgha-code/discussions) |
| Report a bug | [Open an issue](https://github.com/Dirgha-AI/dirgha-code/issues/new?template=bug.md) |
| Request a feature | [Open an issue](https://github.com/Dirgha-AI/dirgha-code/issues/new?template=feature.md) |
| Report a security vulnerability | See [SECURITY.md](../SECURITY.md) — do not use public issues |
| Enterprise / commercial | `enterprise@dirgha.ai` |

## Community

Discord — coming soon.

## More help

The root-level [SUPPORT.md](../SUPPORT.md) has additional channels, response time targets, and guidelines for what makes a good report.
