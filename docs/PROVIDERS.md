# Dirgha Code — Provider reference

16 providers are wired in. Pick one of three on-ramps:

1. **Hosted** — `dirgha login`. The gateway (`api.dirgha.ai`) handles
   routing and quotas; you just see `dirgha.*` model IDs.
2. **BYOK** — set the provider's API key env var. Direct HTTP, no
   gateway.
3. **Local** — Ollama (or any OpenAI-compatible local server) via
   `DIRGHA_LOCAL_URL`.

## Provider table

| Provider | Env var | How to get the key | Notes |
|---|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | console.anthropic.com | `sk-ant-...` |
| OpenAI | `OPENAI_API_KEY` | platform.openai.com/api-keys | Tool-use supported on GPT-5+ |
| OpenRouter | `OPENROUTER_API_KEY` | openrouter.ai/keys | Useful for :free tier models |
| NVIDIA NIM | `NVIDIA_API_KEY` | build.nvidia.com | Free tier available |
| Fireworks | `FIREWORKS_API_KEY` | fireworks.ai | Fast open models |
| Groq | `GROQ_API_KEY` | console.groq.com | Llama, Mixtral fast inference |
| xAI | `XAI_API_KEY` | console.x.ai | Grok models |
| Google Gemini | `GEMINI_API_KEY` | aistudio.google.com | 1M+ context on Gemini 3.x |
| Mistral | `MISTRAL_API_KEY` | console.mistral.ai | European hosting |
| Cohere | `COHERE_API_KEY` | dashboard.cohere.com | Strong RAG embed |
| Perplexity | `PERPLEXITY_API_KEY` | perplexity.ai/settings/api | Built-in web search |
| Together AI | `TOGETHER_API_KEY` | api.together.xyz | Open-weights catalog |
| DeepInfra | `DEEPINFRA_API_KEY` | deepinfra.com | Cheap hosting |
| Vercel AI | `VERCEL_AI_API_KEY` | vercel.com/ai | Vercel-hosted catalog |
| Ollama (local) | `OLLAMA_BASE_URL` | Install from ollama.com | Default `http://localhost:11434` |
| Dirgha Gateway | `DIRGHA_API_KEY` (if BYOK) | `dirgha login` handles it | Default when `dirgha login` |

Add more keys through the interactive flow:

```sh
dirgha auth
```

`auth` is the legacy BYOK wizard. For hosted accounts use `dirgha
login` (device flow).

## Rate limits and retries

- **Client-side throttling is off by default.** Providers enforce
  rate limits server-side; `dispatch.ts` retries 429s with jittered
  exponential backoff.
- **Opt into client throttling** per provider if you hit daily caps
  on free tiers:
  ```sh
  export DIRGHA_RATE_LIMIT_OPENROUTER=20     # requests/min
  export DIRGHA_RATE_LIMIT_GEMINI=10
  ```
- **Circuit breaker** — 5 consecutive failures within 60s trips the
  breaker for that provider for 60s. `dirgha models health` shows
  current breaker state.

## Automatic failover

The dispatcher tries providers in the order configured by
`DIRGHA_PROVIDER_ORDER` (default: gateway, anthropic, openrouter,
nvidia). If one fails (breaker tripped, 5xx, network), the next one
is tried with the same model mapping. Failover is silent unless
`DIRGHA_DEBUG_ROUTING=1` is set.

## BYOK with no account

If you only set provider env vars and never run `dirgha login`,
everything still works in BYOK mode:

- No quota tracking — the provider enforces its own.
- No session sync to the cloud (they stay in `~/.dirgha/sessions/`).
- No analytics (opt-in anyway).
- `dirgha status` reports "BYOK ready — no account".

## Local-only mode

Set `OLLAMA_BASE_URL=http://localhost:11434` and unset all API keys.
The dispatcher falls through to the local provider. Works offline.
Use for airgapped development, dogfooding, or privacy-critical flows.

## Quirks worth knowing

- **Anthropic** requires `anthropic-version: 2023-06-01` header.
  We send it automatically; if you proxy, preserve it.
- **OpenAI tool-use streaming** emits `tool_calls.delta` chunks; we
  accumulate them before emitting the `tool_use` block. This adds a
  small buffering latency on the first tool call.
- **Gemini** doesn't return usage stats until the stream closes;
  quota checks are end-of-request only.
- **Groq** occasionally returns HTTP 499 under load; treat as retry.
- **xAI** has stricter tool-call JSON validation than most — keep
  schemas lean.

## Reporting a provider bug

Include:
- Provider name + model ID
- `DIRGHA_DEBUG_ROUTING=1 dirgha ...` output
- Expected vs actual behavior
- Your provider's API base URL if you set a custom one

Email `security@dirgha.ai` only if the bug involves credentials or
leaking provider tokens.
