# `@dirgha/arniko-plugin` — spec

Standalone npm package that augments dirgha's layer-1 skill scanner with [Arniko](https://github.com/Dirgha-AI/arniko-release)'s 36-scanner pipeline. Ships as a separate package so the default `@dirgha/code` install stays lean. Users who want enterprise-grade security install the plugin; everyone else gets the heuristic scanner alone.

## Install

```bash
dirgha skills install https://github.com/Dirgha-AI/arniko-plugin
# or
npm i -g @dirgha/arniko-plugin
```

The plugin auto-loads at dirgha startup via the extensions API at `~/.dirgha/extensions/arniko-plugin/index.mjs`.

## What it does

| Hook | Trigger | Behaviour |
|---|---|---|
| `before_skill_install` | runs after layer-1 scanner, before clone is finalised | Calls `arniko scan --type=skill <path>`. If Arniko reports critical, the install is rejected even if layer 1 said warn. |
| `before_extension_load` | runs at dirgha boot for each extension | Calls `arniko scan --type=extension <path>`. Extensions are TypeScript code, not just markdown; secrets / SAST / supply-chain matter more than prompt-injection here. |
| `tool_call` (registered) | every `task` tool call | Optional: scan the sub-agent's `prompt` for indirect-injection markers. Off by default; opt in via `dirgha settings set arniko.scan_subagent_prompts=true`. |

The plugin also registers two tools the model can call:

```
arniko_scan(path: string, type: 'skill' | 'extension' | 'repo')
  → returns Arniko's structured findings JSON.

arniko_attest(artifact: string)
  → returns SBOM + provenance attestation for a release artifact.
```

## Implementation skeleton

```js
// arniko-plugin/index.mjs
import { spawnSync } from 'node:child_process';

function arnikoOk() {
  try { spawnSync('arniko', ['--version'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function scan(type, path) {
  const r = spawnSync('arniko', ['scan', '--type', type, '--json', path], { encoding: 'utf8' });
  return r.status === 0 ? JSON.parse(r.stdout) : null;
}

export default function (api) {
  if (!arnikoOk()) {
    api.on('startup_warn', () => 'arniko CLI not found; arniko-plugin disabled. Run: pnpm i -g @dirgha/arniko');
    return;
  }
  api.on('before_skill_install', async ({ path, layerOneVerdict }) => {
    const r = scan('skill', path);
    if (!r) return undefined;
    if (r.criticals > 0) return { block: true, reason: `arniko critical: ${r.summary}` };
    return { warn: r.summary };
  });
  api.on('before_extension_load', async ({ path }) => {
    const r = scan('extension', path);
    if (r?.criticals > 0) return { block: true, reason: r.summary };
    return undefined;
  });
  api.registerTool({
    name: 'arniko_scan',
    description: 'Run an Arniko deep scan over a local path. Returns findings JSON.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, type: { type: 'string', enum: ['skill', 'extension', 'repo'] } }, required: ['path'] },
    async execute(input) {
      const r = scan(input.type ?? 'repo', input.path);
      return { content: r ? JSON.stringify(r, null, 2) : 'arniko produced no output', isError: r === null, durationMs: 0 };
    },
  });
}
```

## Package.json

```json
{
  "name": "@dirgha/arniko-plugin",
  "version": "0.1.0",
  "description": "Arniko-powered deep security scanner for dirgha-code skills + extensions.",
  "type": "module",
  "exports": { ".": "./index.mjs" },
  "files": ["index.mjs", "README.md", "LICENSE"],
  "peerDependencies": {
    "@dirgha/code": "^1.3.0",
    "@dirgha/arniko": "^0.1.0"
  },
  "license": "Apache-2.0"
}
```

## Why a separate package

1. Arniko is **36 scanners + a dashboard + a database layer**. Bundling that into dirgha would bloat the default install for users who don't need it.
2. Arniko releases independently — bundling pins us to its version.
3. **Dogfoods our own extensions API.** A real, non-trivial integration that any contributor can read and learn from.
4. Default install stays lean. Layer 1 (heuristic scanner, ~150 LOC, ships with the CLI) is the baseline defence.

## Dependencies on dirgha-cli

This plugin depends on the extensions API hooks `before_skill_install` and `before_extension_load`. As of 1.3.0 the API supports `before_skill_install` only via the existing `loadExtensions` flow + `api.on(event, handler)`. The two new hook events need to be emitted from:

- `cli/subcommands/skills.ts` (skills install path) → emit `before_skill_install` after layer-1 scan, accept `{ block: true, reason }` to abort.
- `cli/main.ts` extension load (boot) → emit `before_extension_load` per extension, accept `{ block: true, reason }` to skip that extension.

Both wiring changes are <30 LOC each in the dirgha-cli repo and gate the plugin's functionality. They do NOT need to ship before the plugin — without them, the plugin's tools (`arniko_scan`) still work, just without the auto-gate.

## Sprint plan for the plugin itself

| Step | What |
|---|---|
| 1 | Create `Dirgha-AI/arniko-plugin` repo with the `index.mjs` skeleton above |
| 2 | Write a smoke test that mocks `arniko` and asserts the `before_skill_install` hook is called |
| 3 | Publish `@dirgha/arniko-plugin@0.1.0` to npm |
| 4 | In `@dirgha/code` 1.4.0, emit `before_skill_install` + `before_extension_load` events |
| 5 | Document the install path in `docs/agents/skill-security.md` (already linked) |

## Why not just put it inline in dirgha-cli

Same answer as why `rtk` and `qmd` are external tools the agent shells out to — keeping dirgha lean, and proving the plugin path is real for third-party authors. Anyone reading this spec can author their own security plugin (or replace Arniko with `garak` only, or `llm-guard` only) using the same shape.
