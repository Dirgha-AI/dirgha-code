# Contribution paths

Three copy-pasteable recipes for adding the most common kinds of contribution: a new provider, a new tool, and a plugin extension. Each recipe lists the exact files to touch and the order to touch them in. If you follow the recipe, your PR will be small, reviewable, and mergeable.

If your contribution doesn't fit one of these patterns, open a Discussion first so we can sketch the surface together before you write code.

---

## Recipe 1 — Add a new LLM provider

**When to use:** you want Dirgha Code to talk to a provider it doesn't support yet (e.g. a new inference API, a private on-prem endpoint, a regional provider).

**Time estimate:** 1–2 hours for a provider that's already OpenAI-compatible. Half a day for a provider with a custom wire format.

### Files you will touch

| Order | File | What you add |
|---|---|---|
| 1 | `src/providers/<name>.ts` | The `callFoo` function that calls the API and returns a `ModelResponse`. |
| 2 | `src/providers/types.ts` | Add `'<name>'` to the `Provider` union. |
| 3 | `src/providers/detection.ts` | Pattern-match on model IDs owned by this provider. Key-based fallback if applicable. |
| 4 | `src/providers/dispatch.ts` | One line in `providerFromModelId` (optional if covered by env override), and one `case '<name>':` arm in the switch inside `callModel`. |
| 5 | `src/agent/model-fallback.ts` | Add entries so users of your provider's models get cross-provider rescue. |
| 6 | `src/providers/__tests__/<name>.test.ts` | A shape test for `providerFromModelId` and one live test guarded by `if (!process.env.FOO_API_KEY) return`. |

### Walkthrough

**Step 1.** Copy `src/providers/openrouter.ts` (the simplest OpenAI-compatible example) to `src/providers/foo.ts`. Rename the function, change the base URL, update the auth header. If your provider speaks real OpenAI-compatible SSE, you can reuse `streamSSE` from `./http.js` and `toOpenAIMessages` / `toOpenAITools` / `normaliseOpenAI` directly. For a custom wire format, see `src/providers/anthropic.ts` for the pattern.

```ts
// src/providers/foo.ts
import { postJSON, streamSSE } from './http.js';
import { toOpenAITools } from './tools-format.js';
import { toOpenAIMessages } from './messages.js';
import { normaliseOpenAI } from './normalise.js';
import type { Message, ModelResponse } from '../types.js';

const BASE = 'https://api.foo.ai/v1/chat/completions';

export async function callFoo(
  messages: Message[],
  systemPrompt: string,
  model: string,
  onStream?: (text: string) => void,
): Promise<ModelResponse> {
  const apiKey = process.env['FOO_API_KEY'];
  if (!apiKey) throw new Error('FOO_API_KEY not set');

  const headers = { Authorization: `Bearer ${apiKey}` };
  const payload = {
    model,
    messages: toOpenAIMessages(messages, systemPrompt),
    tools: toOpenAITools(),
    tool_choice: 'auto',
  };

  if (onStream) {
    const { usage, toolUseBlocks } = await streamSSE(BASE, headers, payload, onStream);
    return { content: toolUseBlocks, usage: usage ? { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens } : undefined };
  }
  return normaliseOpenAI(await postJSON(BASE, headers, payload));
}
```

**Step 2.** Add `'foo'` to the `Provider` union in `src/providers/types.ts`.

**Step 3.** In `src/providers/detection.ts`, pattern-match the model IDs your provider owns:

```ts
if (selectedModel.startsWith('foo/')) return 'foo';
```

And in the key-based fallback list, decide priority:

```ts
if (process.env['FOO_API_KEY']) return 'foo';
```

**Step 4.** In `src/providers/dispatch.ts`, add `import { callFoo } from './foo.js';` at the top. Extend the `ProviderId` union with `'foo'`. Add the model-ID inference line in `providerFromModelId`:

```ts
if (id.startsWith('foo/')) return 'foo';
```

Add the switch arm in `callModel`:

```ts
case 'foo': return callFoo(effectiveMessages, effectiveSystem, model, wrappedOnStream);
```

**Step 5.** In `src/agent/model-fallback.ts`, add fallback entries. Start conservative — one alternate that's known to work:

```ts
'foo/your-flagship-model': ['openrouter/elephant-alpha', 'qwen/qwen3-coder:free'],
```

**Step 6.** Write a shape test. Put it in `src/providers/__tests__/foo.test.ts`. Copy the structure of `src/providers/__tests__/detection.test.ts`. Live API tests should skip when the key is absent — don't fail CI just because a contributor didn't supply their key to your PR.

### Checklist before you open the PR

- [ ] New file is under 100 lines unless the wire format genuinely needs more.
- [ ] `pnpm lint` passes (no `any` in public signatures).
- [ ] `pnpm test` passes locally (your new tests skip gracefully without the API key).
- [ ] Added your API key name to `README.md`'s env-vars table if one exists.
- [ ] Added a one-line note in `CHANGELOG.md` under `## [Unreleased]`.

---

## Recipe 2 — Add a new tool

**When to use:** you want the agent to gain a new capability — file-system, shell, web, database, IDE, whatever.

**Time estimate:** 1–2 hours for a simple tool. Half a day if it needs a sandbox.

### Files you will touch

| Order | File | What you add |
|---|---|---|
| 1 | `src/tools/<name>.ts` | The handler function that does the work and returns `{ result, error? }`. |
| 2 | `src/tools/defs.ts` | The JSON Schema + name + description that the model sees. |
| 3 | `src/tools/index.ts` | Route the tool name to your handler. |
| 4 | `src/permission/judge.ts` | If the tool is destructive, declare it so the user gets confirmed before first use. |
| 5 | `src/tools/__tests__/<name>.test.ts` | A unit test per behavior (success, error, edge cases). |

### Walkthrough

**Step 1.** Look at `src/tools/file.ts` or `src/tools/git.ts` for the pattern. Your handler:

```ts
// src/tools/fetch_url.ts
export async function fetchUrl(input: { url: string; method?: string }): Promise<{ result: string; error?: string }> {
  try {
    const res = await fetch(input.url, { method: input.method ?? 'GET' });
    const text = await res.text();
    return { result: text.slice(0, 50_000) };
  } catch (e) {
    return { result: '', error: e instanceof Error ? e.message : String(e) };
  }
}
```

Keep handlers **pure of TUI state**. They receive input, return output. No side-effects on global state.

**Step 2.** Add the schema in `src/tools/defs.ts`:

```ts
{ name: 'fetch_url',
  description: 'Fetch a URL and return up to 50k chars of body text. Use for quick API or docs checks.',
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      method: { type: 'string', enum: ['GET', 'HEAD'] },
    },
    required: ['url'],
  },
},
```

The description is what the model reads to decide when to call your tool. Write it for the model, not for humans. Concrete verbs, concrete trigger conditions, concrete limits.

**Step 3.** Wire it in `src/tools/index.ts`'s executor switch so a tool name maps to your handler.

**Step 4.** If the tool is destructive (writes files, runs shell, calls external APIs that mutate state), add it to the list in `src/permission/judge.ts` so the user is asked for confirmation the first time.

**Step 5.** Unit test at minimum:
- Success path with expected output.
- Error path (network failure, malformed input).
- Boundary (truncation at the 50k char limit, or whatever your limit is).

### Checklist before you open the PR

- [ ] The description in `defs.ts` is under ~150 chars and tells the model when to use the tool, not what it does.
- [ ] Handler is idempotent where possible; if not, documented.
- [ ] Destructive tools registered in `permission/judge.ts`.
- [ ] Unit tests cover success, error, and boundary cases.
- [ ] `pnpm lint` + `pnpm test` pass.
- [ ] Entry added under `## [Unreleased]` in `CHANGELOG.md`.

---

## Recipe 3 — Add an MCP extension or plugin

**When to use:** you want to expose tools from an MCP server, a custom binary, or any external process, without baking them into core.

**Time estimate:** 30 minutes for an MCP server that already exists, an afternoon for a brand-new one.

### Files you will touch

| Order | File | What you add |
|---|---|---|
| 1 | `~/.dirgha/extensions.json` | Local user config pointing at the MCP server binary. No repo change needed. |
| 2 | `src/extensions/*.ts` | Only if you're changing the extension host (not the common case). |
| 3 | `docs/cli/EXTENSIONS.md` | If your extension is broadly useful, document it here for discovery. |

### Walkthrough

For the 80% case — a user wants to wire an MCP server into their own CLI — **no source change is required**. The contribution is a doc + an example config.

**Step 1.** In `~/.dirgha/extensions.json`:

```json
{
  "extensions": [
    {
      "name": "my-linear",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-linear"],
      "env": { "LINEAR_API_KEY": "lin_api_..." }
    }
  ]
}
```

**Step 2.** Run `dirgha` and verify the tools appear in `/tools` with the `my-linear__` prefix.

**Step 3.** If you want to ship this as a first-class extension for everyone, add an entry to `docs/cli/EXTENSIONS.md` with install instructions. That's the PR.

For the 20% case — you're adding a new kind of extension host — look at `src/extensions/manager.ts` and the MCP client implementation. Open a Discussion before cutting a PR; changes to the extension host affect every existing extension.

### Checklist before you open the PR

- [ ] Extension documented in `docs/cli/EXTENSIONS.md` with install + config snippet.
- [ ] Tested with a fresh `~/.dirgha/extensions.json` so the example config actually works.
- [ ] If the extension calls a paid API, note it in the docs so users aren't surprised.

---

## A note on scope

Keep PRs atomic. One provider per PR. One tool per PR. One extension per PR. A "big bang" PR that adds a provider, a tool, and refactors three unrelated files will bounce on review every time. Small, boring, correct PRs merge fast.

## If you get stuck

- Ask in [Discussions](https://github.com/dirghaai/dirgha-code/discussions). Include the file you're in and the specific line you're on.
- Read the nearest existing example (the recipe tables above all point at one).
- Don't guess at types — `pnpm lint` is your friend and the error messages are usually right.

Welcome aboard.
