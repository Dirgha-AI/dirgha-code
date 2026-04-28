# Skill: add-provider

> Add a new LLM provider to dirgha-cli. Six files, repeatable, idempotent.

## When to invoke

Trigger this skill when the user asks any of:

- "add provider X"
- "support Z model"
- "wire up <vendor>"
- `/provider add <name>` (the slash command emits this skill's recipe verbatim)

## Inputs

| Field | Example | Notes |
|---|---|---|
| `name` | `cohere` | Lowercase identifier used in code + dispatch. |
| `displayName` | `Cohere` | Human label for `dirgha keys list` and `dirgha doctor`. |
| `baseUrl` | `https://api.cohere.com/v2` | OpenAI-compatible endpoint preferred. |
| `envVar` | `COHERE_API_KEY` | Uppercase, follows existing convention. |
| `helpUrl` | `https://dashboard.cohere.com/api-keys` | Where users get their key. |
| `defaultModels` | `['cohere/command-a', 'cohere/c4ai-aya']` | Catalogue suggestions. |
| `pricing` | `{ inputPerM: 2.5, outputPerM: 10 }` | Per-million tokens, USD. |

## Steps (do NOT skip; verify after each)

### 1. Provider client — `src/providers/<name>.ts`

Copy `src/providers/openrouter.ts` as a template if the API is OpenAI-compatible; otherwise copy `anthropic.ts` for Anthropic-style or `gemini.ts` for vendor-shaped APIs. Key edits:

- Class name: `<Name>Provider`.
- `id`: `'<name>'`.
- `defaultBaseUrl`: vendor's base URL.
- Auth header: `Authorization: Bearer ${apiKey}` for OpenAI-compat, custom otherwise.
- Stream parse: re-use the OpenAI SSE helper if compatible.

Verify:

```bash
node -e "import('./dist/providers/<name>.js').then(m => console.log(typeof m.<Name>Provider))"
```

### 2. Provider registry — `src/providers/index.ts`

Add to imports:

```ts
import { <Name>Provider } from './<name>.js';
```

Add to `ProviderRegistryConfig`:

```ts
<name>?: ProviderConfig;
```

Add to the `construct()` switch:

```ts
case '<name>': return new <Name>Provider(this.config.<name> ?? {});
```

### 3. Dispatch routing — `src/providers/dispatch.ts`

Add `'<name>'` to the `ProviderId` union. Add a `RoutingRule` so model IDs with the right prefix or vendor slug land on the new provider:

```ts
{ match: id => id.startsWith('<name>/'), provider: '<name>' },
```

If the provider hosts vendor-prefixed models that overlap with OpenRouter (e.g. `mistral/...`), use the `NVIDIA_NIM_MODELS` whitelist pattern — exact-ID match first, then prefix fallthrough.

### 4. Pricing + catalogue — `src/intelligence/prices.ts`

Add at least one row per default model to `MODEL_PRICES`:

```ts
{ provider: '<name>', model: '<name>/command-a', inputPerM: 2.5, outputPerM: 10 },
```

Add context-window entries to `MODEL_CONTEXT_WINDOWS`:

```ts
'<name>/command-a': 128_000,
```

Add aliases to `MODEL_ALIASES` if the user-facing name is shorter:

```ts
cohere: '<name>/command-a',
```

### 5. BYOK setup — `src/cli/setup.ts`

Add the env var to `BYOK_KEYS`:

```ts
{ label: '<DisplayName>', env: '<ENV_VAR>', helpUrl: '<helpUrl>', suggested: ['<name>/command-a'] },
```

This wires `dirgha keys add <ENV_VAR> <key>` and `dirgha keys list`.

### 6. Test — `src/providers/__tests__/<name>.test.ts`

Mirror `src/providers/__tests__/openrouter.test.ts`. Minimum coverage:

- Constructor reads the env var.
- `stream()` builds the request with the right URL + auth header.
- One happy-path test that asserts a `text_delta` event is emitted from a stubbed SSE response.

Verify the whole sprint with:

```bash
npm run typecheck
npm test -- providers/__tests__/<name>
dirgha keys add <ENV_VAR> sk-test...
dirgha keys list | grep <ENV_VAR>     # → "stored"
dirgha ask -m <name>/command-a "respond exactly: provider ok"
```

## Done condition

- `npm run typecheck` exits 0.
- All existing tests still pass; new unit test passes.
- `dirgha keys list` shows the new env var with status "unset" (or "stored" if user added a key).
- `dirgha ask -m <model>` returns a valid completion when the env var is set.

## Notes for the agent

- **Read existing providers first.** `openrouter.ts`, `nvidia.ts`, and `deepseek.ts` cover the three common shapes (OpenAI-compat, NIM, native).
- **Don't touch `dispatch.ts`'s `RULES` order** — specific NIM matches must come before the catch-all OpenRouter match. Keep the new rule as specific as possible (prefer exact-prefix over `id.includes('/')`).
- **No git config edits.** Hard rule from `.dirgha/feedback`.
- **No model name guesses.** If you don't know the canonical IDs, ask the user or check the vendor's docs page (linked from `helpUrl`). Bad model IDs cause silent 400s.
