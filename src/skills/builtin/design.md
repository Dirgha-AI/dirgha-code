---
name: design
description: Dirgha design system — shadcn/ui, Phosphor Icons, CSS variable tokens
always: true
---

## Dirgha Design System (Always Active)

Stack: **shadcn/ui** + **Radix UI** + **Phosphor Icons** + **Tailwind CSS** + **CVA**

---

### Icons — Phosphor only

ALWAYS import from the `@icons` alias (curated bundle, not the full library):
```tsx
// ✅ Correct
import { MagnifyingGlass, ArrowRight, Gear } from '@icons';

// ❌ Wrong — causes bundle bloat
import { MagnifyingGlass } from '@phosphor-icons/react';
```

Common name mappings (Phosphor ≠ Lucide):
| Lucide name | Phosphor name |
|-------------|---------------|
| `Search` | `MagnifyingGlass` |
| `Settings` | `Gear` |
| `ChevronDown` | `CaretDown` |
| `ExternalLink` | `ArrowSquareOut` |
| `Check` | `Check` |
| `X` | `X` |
| `Plus` | `Plus` |

Icon weights: `regular` (default), `bold`, `fill`, `duotone`, `thin`, `light`
```tsx
<Gear weight="duotone" size={20} />
```

---

### Colors — CSS variables only, never hardcoded

All colors live in `packages/design-system/src/tokens/colors.css`.
Use CSS variable tokens. Zero hardcoded hex values in components.

**Semantic tokens (light/dark auto-switch):**
```css
var(--bg)              /* page background */
var(--bg-surface)      /* card / panel */
var(--bg-raised)       /* elevated surface */
var(--bg-secondary)    /* alt background */
var(--text)            /* primary text */
var(--text-secondary)  /* secondary text */
var(--text-muted)      /* muted / placeholder */
var(--border)          /* default border */
var(--border-strong)   /* stronger border */
```

**Status tokens:**
```css
var(--status-success)  /* #16a34a */
var(--status-warning)  /* #d97706 */
var(--status-error)    /* #dc2626 */
var(--status-info)     /* #2563eb */
```

**Per-app accents** (set dynamically via `useAdvancedTheme`):
```css
var(--accent)          /* current app accent color */
var(--accent-glow)     /* glow shadow for accent */
```
App accent values: chat=#10b981, research=#8b5cf6, studio=#f59e0b, writer=#ec4899

---

### Typography

Fonts: `Geist` (UI/body), `Geist Mono` (code), `Georgia` (serif/display)

```tsx
<h1 className="font-sans text-2xl font-semibold text-[var(--text)]">
<code className="font-mono text-sm text-[var(--text-muted)]">
```

---

### Component Pattern

Use **CVA + CSS vars + shadcn**. Never hardcode colors.

```tsx
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  'rounded-lg border bg-[var(--bg-surface)] text-[var(--text)]',
  {
    variants: {
      variant: {
        base:    'border-[var(--border)]',
        raised:  'border-[var(--border-strong)] shadow-sm',
        ghost:   'border-transparent bg-transparent',
      },
    },
    defaultVariants: { variant: 'base' },
  }
);

export function Card({ variant, className, ...props }) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}
```

---

### Adding shadcn Components

```bash
pnpm dlx shadcn@latest add button card input badge
```

Components land in `packages/ui/src/components/ui/`.
After adding: update `packages/ui/src/index.ts` to re-export.

---

### Rules

1. **No hardcoded hex** — always `var(--token-name)`
2. **Import icons from `@icons`** — never `@phosphor-icons/react` directly
3. **shadcn base** — extend CVA variants, don't override shadcn internals
4. **Spacing:** Tailwind scale (`p-4` = 16px, `p-2` = 8px) — 4px base unit
5. **Mobile-first:** `sm:` 640px, `md:` 768px, `lg:` 1024px, `xl:` 1280px
6. **Themes:** Use `useAdvancedTheme()` hook for accent color, never read localStorage directly
7. **Status:** Color-coded + icon/text always (never color-only for accessibility)
