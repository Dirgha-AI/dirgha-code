---
name: Dirgha
tagline: Build to last. Code with Dirgha.
colors:
  ink: "#0a0a0a"
  surface: "#161413"
  surface-2: "#23211f"
  cream: "#f7f3ed"
  cream-mute: "#a8a29e"
  amber: "#d4a373"
  amber-deep: "#a87c4f"
  sage: "#7c8b7e"
  copper: "#c25a4f"
  ink-glow: "#191614"
typography:
  display:
    fontFamily: Inter, system-ui, sans-serif
    weight: 600
    tracking: -0.025em
    use: hero, section heads, wordmark
  body:
    fontFamily: Inter, system-ui, sans-serif
    weight: 400
    use: paragraphs, captions
  mono:
    fontFamily: JetBrains Mono, ui-monospace, monospace
    weight: 400
    use: code, commands, output
spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, 2xl: 64, 3xl: 96 }
radii: { sm: 4, md: 8, lg: 12, xl: 16, pill: 999 }
motion:
  ease: cubic-bezier(0.22, 0.61, 0.36, 1)
  fast: 200ms
  base: 320ms
  slow: 600ms
  feel: deliberate. Things move once and settle. No springs, no loops.
---

# Dirgha — design system

Authoritative for every Dirgha surface — CLI, web, video, slides. Frontmatter is machine-readable; the prose explains why.

## Voice

Dirgha talks like a senior engineer explaining their setup to a peer. Direct. Informed. Useful. No marketing flourish, no hype.

The audience is split between developers (who care about correctness, performance, and ergonomics) and investors (who care about defensibility, engineering quality, and unit economics). The same prose has to satisfy both. The way to do that is by being precise — show the parity matrix, show the test count, show the LOC budget, show the architecture diagram. Specifics outperform claims.

**Lean in:** sovereign · terminal · deliberate · honest · engineered · precise · BYOK.
**Avoid:** free · cute · revolutionary · synergistic · disruptive · seamless · empowering · unleash · supercharge · "we are excited."

We do not say "free compute" or "free-tier first." Dirgha is a BYOK product. Some providers (OpenRouter, NVIDIA NIM) happen to offer free-tier endpoints that work with the same `OPENROUTER_API_KEY` / `NVIDIA_API_KEY` Dirgha already routes through — that's a property of those providers, not a Dirgha promise. Frame it as: "Bring your own keys, including the free tiers some providers offer."

## Tagline

```
Build to last. Code with Dirgha.
```

Two beats. The first is the value: longevity, durability, sovereignty. The second is the action. The product name comes second, not first.

## Naming convention

The product is **Dirgha**. The npm package is `@dirgha/code`. The CLI binary is `dirgha`. "Dirgha Code" disambiguates the CLI from the broader Dirgha ecosystem (gateway, web, mobile) — used at the end of copy and in package metadata, not the start.

Wrong:
> Dirgha Code is a terminal coding agent that …

Right:
> A terminal coding agent that ships working code through 17 providers, with cited test coverage and parity scoring. Dirgha Code, on npm.

## Why these colors

The palette is **warm monochromatic** — black, cream, and a single warm amber accent. It reads like a hardcover technical book, not a SaaS dashboard. Sage green is the quiet "OK" state (test pass, scan clean). Copper is the only red-adjacent value, used sparingly for warnings.

We do NOT use:
- Pure white. Too clinical against the cream.
- Pure red. Alarmist. Copper does the same job with less noise.
- Gradients on text or backgrounds. Flat surfaces only.
- Drop shadows. Inset edges only.

## Why Inter

Inter is the modern UI default for a reason. Designed by Rasmus Andersson specifically for screens — variable axes, optical sizing, slashed-zero option for code, excellent rendering at small sizes. Vercel, Linear, Figma, and most thoughtful developer tools ship in Inter. We do too.

One family across everything. **Display = Inter at weight 600 with tight tracking (-0.025em).** **Body = Inter at weight 400.** That's the rule. Bold inside paragraphs is reserved for emphasis. Italic is for technical terms on first appearance.

JetBrains Mono is the only secondary face. It matches what developers see in their editor, so a code snippet feels native, not pasted-in.

## Logo

The wordmark is `Dirgha` set in Inter Display weight 600 with tight tracking. No diacritics, no decoration. Capital D, lowercase rest.

Symbol-only mark: `◈`, the four-cusped diamond. Used in CLI prompts and favicons.

Color usage:
- Wordmark cream-on-ink for dark surfaces (default)
- Wordmark ink-on-cream for printed materials
- Symbol amber-on-ink for accent moments (cursor blink, CLI spinner)

`assets/logo/` ships:
- `dirgha-wordmark-cream.svg` — primary wordmark
- `dirgha-wordmark-ink.svg` — for cream backgrounds
- `dirgha-mark-amber.svg` — symbol only, accent
- `dirgha-mark-cream.svg` — symbol only, monochrome

## Motion

Things appear, settle, and stay. No bouncing, no springs, no looping decoration.

- **Type-on for text** that represents user input or streamed agent output. 30–40 ms per character. Slows on punctuation (50 ms after `.`, `,`, `;`).
- **Fade-in for everything else** — 320 ms with the `ease` curve. Never slide-in from off-screen.
- **No mid-loop motion.** Once on screen, an element doesn't drift, breathe, or pulse. The cursor is the only exception (1 Hz blink).
- **Cuts, not crossfades** between major sections in video.

## Audio

Background for video is a slow ambient drone. Warm, low-mid, not melodic. Reference: somewhere between *Music for Airports* and the hum of a quiet server room. Never upbeat tech-stock — the opposite of the brand.

Spec for promo audio (synthesised in ffmpeg, no licensing):
- Base drone: 110 Hz sine (A2) at -18 dB
- Fifth above: 165 Hz sine (E3) at -22 dB, slow LFO at 0.1 Hz
- Pink noise floor: -38 dB, low-pass at 800 Hz
- 2 s fade-in, 4 s fade-out
- No percussion, no melody, no swells beyond the LFO breath

## How to use this file

Any AI agent or designer working on Dirgha reads this file before producing visuals or copy. Tokens are authoritative. Prose is rationale. Don't invent values that aren't here.
