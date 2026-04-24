# src/experimental/

**What goes here:** modules and command surfaces that are implemented
but not ready for the default user experience. Everything under this
directory (and everything gated with `registerIfExperimental` from
`src/utils/experimental.ts`) is hidden unless the user opts in:

```sh
DIRGHA_EXPERIMENTAL=1 dirgha --help
```

## Currently experimental

These are gated by the flag today, even though they still live at
their historical paths for import-graph reasons:

| Surface | Location | Gate call site |
|---|---|---|
| `mesh` (libp2p compute mesh) | `src/mesh/` | `registerIfExperimental('mesh', ...)` in `src/index.ts` |
| `swarm` (multi-agent coordinator) | `src/swarm/` | `registerIfExperimental('swarm', ...)` |
| `dao` (decentralized organizations) | `src/commands/dao.ts` | `registerIfExperimental('dao', ...)` |
| `make` (manufacturing) | `src/commands/make.ts` | `registerIfExperimental('make', ...)` |
| `bucky` (labor marketplace) | `src/commands/bucky.ts` | `registerIfExperimental('bucky', ...)` |
| `join-mesh` | `src/commands/join-mesh.ts` | `registerIfExperimental('join-mesh', ...)` |
| `voice` / `voice-config` | `src/voice/` | `registerIfExperimental('voice', ...)` |

## Graduation checklist

Before a surface graduates out of experimental:

1. **No `@ts-nocheck`** — type errors are either fixed or explicitly
   annotated with a narrow `as` cast plus a one-line justification.
2. **Tests** — at least `src/<feature>/<feature>.test.ts` covering the
   happy path and two failure modes. For anything that writes state,
   add property-style tests.
3. **Docs** — an entry in the top-level README *and* a section in
   `docs/PROVIDERS.md` or a sibling user-facing file. If it has a
   stable flag/env-var, it appears in `docs/CONFIG.md`.
4. **Remove the gate** — delete the `registerIfExperimental` wrapper
   in `src/index.ts` and replace it with a plain `register*(program)`
   call.

## Adding a new experimental surface

- Land the code at its natural path.
- Wrap the registration in `src/index.ts` with
  `registerIfExperimental('<name>', () => register...(program))`.
- Add a row to the table above.

This matches the Rust nightly / Chrome flags pattern: experimental
features compile, but are not part of the promised user experience.
