---
name: arch
description: Slice architecture guardian — DDD boundaries, file budgets, monorepo structure
always: true
---

## Architecture Guardian (Always Active)

### Monorepo Structure (Dirgha)

```
apps/
  platform/     ← React 19 + Vite frontend (port 5177)
  gateway/      ← Hono API (port 3001)
  www/          ← Astro marketing site
packages/
  ui/           ← shadcn/ui component library
    src/components/ui/   ← shadcn base components
  design-system/         ← tokens, icons, theme, Dirgha components
    src/tokens/          ← colors.css, typography.css
    src/icons/index.ts   ← Phosphor icon exports (@icons alias)
    src/theme/           ← advanced-theme.tsx context
    src/app-registry.ts  ← app definitions + accents
  core/         ← shared types + utilities
domains/
  10-computer/cli/   ← Dirgha CLI (this codebase)
```

### File Budget

**Every file ≤100 lines.** When a file grows beyond this:
- Split by responsibility (not by technical layer)
- Each unit: one clear purpose, defined interface, independently testable

### Slice Boundaries

`apps/platform/src/modules/<feature>/` is the feature slice unit.
Slices must not import from sibling slices directly.
Cross-slice code → `packages/core/` or `packages/ui/`.

**Before writing any code:**
1. Does a file/component already exist? (`search_knowledge` or `glob`)
2. Does the change fit in one slice?
3. Multi-slice change → define the interface contract first

### Red Flags — warn when you see these

- File >100 lines after your change → split it, tell the user
- Import from sibling `modules/` slice → refactor to `packages/`
- Hardcoded hex color → use `var(--token)` instead
- `import { X } from '@phosphor-icons/react'` → should be `from '@icons'`
- `any` type cast → add proper type
- Component doing data fetching AND rendering → split into container + presentational

### State Management (Dirgha Platform)

- UI state: React local state or Zustand (`zustand`)
- Server state: `useAdvancedTheme()` for theme, React Query patterns for data
- Forms: `react-hook-form` + `zod`
- Never: Redux, MobX, context for performance-sensitive state

### Testing Convention

- Unit: Vitest (`pnpm test`)
- Integration: real DB/API, no mocks for critical paths
- E2E: Playwright (future)
- Test file colocated: `Component.test.tsx` next to `Component.tsx`

## Common Shortcuts — Rejected

These rationalizations are recognized and rejected:
- "This is a minor change, no need to commit separately" → always commit logical units; atomic commits make bisect possible
- "I'll put it in the closest file for now and refactor later" → slices diverge fast; put code in the right place the first time
- "This component is only 110 lines, close enough" → 100-line budget is firm; split it before committing
- "I'll import from the sibling module just this once" → cross-slice imports are architectural debt that compounds; use `packages/core/`
- "The types are mostly right" → type-check with `pnpm tsc --noEmit` before every commit; "mostly" ships bugs
- "I know the existing code won't conflict" → read the file before editing; collisions are invisible until they break
