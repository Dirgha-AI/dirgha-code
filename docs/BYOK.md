# BYOK — Bring Your Own Key

Dirgha Code runs against 14 providers with a single dispatch layer. You
bring a key for any one of them and Dirgha handles routing, failover,
rate limits, and cost accounting. No gateway round-trip, no telemetry,
no per-seat pricing.

This is the recommended setup for serious work. If you prefer a managed
experience with zero keys, see [hosted gateway](#hosted-alternative).

## Fast setup

```bash
# Pick one provider, paste the key
dirgha keys set NVIDIA_API_KEY nvapi-...
dirgha keys set ANTHROPIC_API_KEY sk-ant-...
dirgha keys set OPENROUTER_API_KEY sk-or-v1-...

# Verify
dirgha keys list
dirgha doctor
dirgha status

# Go
dirgha
```

Keys live at `~/.dirgha/keys.json` (mode 0600 — readable only by you).
They're auto-loaded into `process.env` on every Dirgha invocation via
`loadKeysIntoEnv()` in `src/utils/keys.ts`.

## Providers

| Provider | Env var | Recommended model | Notes |
|---|---|---|---|
| **NVIDIA NIM** | `NVIDIA_API_KEY` | `minimaxai/minimax-m2.7` | Free tier generous. Recommended default |
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` | Best for complex reasoning |
| **OpenRouter** | `OPENROUTER_API_KEY` | `openrouter/elephant-alpha` | 300+ models, free tier |
| **Fireworks** | `FIREWORKS_API_KEY` | `accounts/fireworks/routers/kimi-k2p5-turbo` | Fast, cheap |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-5` | GA |
| **Google Gemini** | `GEMINI_API_KEY` | `gemini-2-5-pro` | Long context |
| **xAI (Grok)** | `XAI_API_KEY` | `grok-4` | — |
| **Groq** | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | Ultra-fast inference |
| **Mistral** | `MISTRAL_API_KEY` | `mistral-large-2` | — |
| **Cohere** | `COHERE_API_KEY` | `command-r-plus` | — |
| **DeepInfra** | `DEEPINFRA_API_KEY` | `deepinfra/deepseek-r1` | — |
| **Perplexity** | `PERPLEXITY_API_KEY` | `sonar-pro` | Search-grounded |
| **Together AI** | `TOGETHER_API_KEY` | `togetherai/llama-3.3` | — |
| **Ollama** | *(none)* | `llama3.2` | Point at `localhost:11434` via `OLLAMA_BASE_URL` |

### Provider routing

Dirgha infers the provider from the model ID prefix:

```
claude-*                    → anthropic
gpt-*, o3, o4-*             → openai
gemini-*                    → gemini
grok-*                      → xai
minimaxai/*, moonshotai/*   → nvidia
accounts/fireworks/*        → fireworks
anything with `/` or `:`    → openrouter (catch-all)
bare model name (minimax-m2)→ gateway
```

Explicit override: `DIRGHA_PROVIDER=openrouter dirgha ask …` forces the
dispatcher regardless of the model ID.

### Failover chains

If a provider returns `429`, `502`, `503`, `upstream error`, or is
circuit-breaker-open, Dirgha tries the next model in the fallback chain
(defined in `src/agent/model-fallback.ts`). Sample:

```
minimaxai/minimax-m2.7   → minimaxai/minimax-m2
                         → openrouter/elephant-alpha
                         → qwen/qwen3-coder:free
```

You see a `[throttled] provider failed: …` line in the TUI when this
kicks in.

## Managing keys

```bash
# Add or update
dirgha keys set <KEY> <value>

# List (values masked)
dirgha keys list

# Delete
dirgha keys delete <KEY>

# Where they live
cat ~/.dirgha/keys.json
```

From inside the TUI, `/keys` opens the interactive picker.

## Security

- `~/.dirgha/keys.json` is created with mode 0600 (owner read/write only)
- Keys are only read at CLI startup, not re-read during execution
- No key material is ever logged, sent to any Dirgha server, or written
  to `sessions.db` / checkpoints
- `dirgha doctor` shows which keys are detected without revealing values
- Outgoing requests use the key as `Authorization: Bearer …`; Dirgha
  never sends it in query strings

## Hosted alternative

If you want to skip key management entirely:

```bash
dirgha login                     # device-flow browser handshake
```

This saves a Dirgha Gateway token to `~/.dirgha/credentials.json`.
Dirgha routes all requests through `api.dirgha.ai`, which holds
organization keys and enforces quotas. Pricing: see
[dirgha.ai/pricing](https://dirgha.ai/pricing).

You can use BOTH: if a BYOK key is set for a provider, Dirgha uses it
directly. If not, it falls through to the gateway.

### Headless login

```bash
dirgha login --token dirgha_cli_xxxxxxxxxxx --email you@example.com
```

Generate the token from [dirgha.ai/dashboard](https://dirgha.ai/dashboard).
Useful for CI, shared boxes, or `ssh` sessions where no browser is
available.

### New accounts

```bash
dirgha signup
```

Opens [dirgha.ai/signup?source=cli](https://dirgha.ai/signup?source=cli)
and prompts you to run `dirgha login` after creating an account.

## Troubleshooting

**`dirgha doctor` shows "✗ API key"**
No BYOK key detected and no gateway token. Set a key or run `dirgha login`.

**"Provider nvidia circuit open — skipping"**
Too many consecutive failures from that provider. Wait 60s for the
circuit breaker to reset, or force a different model: `/model claude-sonnet-4-6`.

**"No auth token found"**
`~/.dirgha/credentials.json` missing or expired. Re-run `dirgha login`.

**Keys work outside Dirgha but not inside**
Dirgha only reads `~/.dirgha/keys.json` at startup — if you `export FOO=bar`
in your shell after Dirgha is running, that's too late. Either restart
Dirgha or use `dirgha keys set FOO bar`.
