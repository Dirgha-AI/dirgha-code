---
name: scaffold
description: Scaffold shadcn/ui + Phosphor Icons setup and Dirgha component patterns
always: false
trigger: /scaffold
---

## Scaffold Protocol

**When to use:** Starting a new React/Next/Vite project that should follow Dirgha's stack.

---

### Setup: shadcn/ui + Phosphor Icons

**1. Install shadcn:**
```bash
pnpm dlx shadcn@latest init
# Choose: TypeScript, tailwind, CSS variables, yes to src/ directory
```

**2. Install Phosphor Icons:**
```bash
pnpm add @phosphor-icons/react
```

**3. Create the `@icons` barrel (prevents bundle bloat):**

Create `src/lib/icons.ts` — export only what your project uses:
```ts
export {
  MagnifyingGlass, ArrowRight, ArrowLeft, ArrowUp, ArrowDown,
  CaretDown, CaretUp, CaretLeft, CaretRight,
  X, Check, Plus, Minus, Gear, DotsThree, DotsThreeVertical,
  User, Users, House, Bell, ChatCircle, Envelope,
  File, Folder, Upload, Download, Trash, Pencil, Copy,
  Eye, EyeSlash, Lock, Unlock, Key,
  Warning, Info, CheckCircle, XCircle,
  Spinner, CircleNotch, ArrowClockwise,
  MoonStars, Sun, Monitor,
} from '@phosphor-icons/react';
```

Add path alias in `tsconfig.json` / `vite.config.ts`:
```ts
// vite.config.ts
resolve: { alias: { '@icons': './src/lib/icons.ts' } }
// tsconfig.json
"paths": { "@icons": ["./src/lib/icons.ts"] }
```

**4. Add Dirgha CSS tokens** to `src/index.css`:
```css
:root {
  --bg: #fafaf8;
  --bg-surface: #ffffff;
  --bg-raised: #f5f5f3;
  --bg-secondary: #f0f0ee;
  --text: #1a1a1a;
  --text-secondary: #404040;
  --text-muted: #737373;
  --border: #e5e5e3;
  --border-strong: #d4d4d2;
  --status-success: #16a34a;
  --status-warning: #d97706;
  --status-error: #dc2626;
  --status-info: #2563eb;
  --accent: #10b981;
}
.dark {
  --bg: #0a0a0a;
  --bg-surface: #141414;
  --bg-raised: #1c1c1c;
  --text: #fafafa;
  --text-secondary: #d4d4d4;
  --text-muted: #a3a3a3;
  --border: #2a2a2a;
  --border-strong: #3a3a3a;
}
```

---

### Adding shadcn Components

```bash
pnpm dlx shadcn@latest add button card input badge dialog
pnpm dlx shadcn@latest add dropdown-menu tooltip sheet tabs
```

After adding: always check that the component uses `var(--token)` not hardcoded colors. If not, update the className props.

---

### Scaffold a Feature Component

When asked to create a new component, follow this pattern:

```tsx
// src/components/FeatureName/index.tsx
import { IconName } from '@icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FeatureNameProps {
  title: string;
  className?: string;
}

export function FeatureName({ title, className }: FeatureNameProps) {
  return (
    <div className={cn('rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4', className)}>
      <div className="flex items-center gap-2">
        <IconName size={16} className="text-[var(--text-muted)]" />
        <h2 className="text-sm font-medium text-[var(--text)]">{title}</h2>
      </div>
    </div>
  );
}
```

---

### Scaffold a Slash Command

For `/scaffold <type>`:
- `/scaffold component <Name>` → empty component with Dirgha pattern
- `/scaffold page <name>` → page component + route
- `/scaffold api <endpoint>` → Hono route handler + types
- `/scaffold form <name>` → react-hook-form + zod schema
