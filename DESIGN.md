---
name: Dirgha
tagline: Build to last. Code with Dirgha. Think.
colors:
  ink: "#0a0a0a"           # near-black background, document feel
  surface: "#161413"        # secondary surface (cards, code blocks)
  surface-2: "#23211f"      # tertiary surface (inset panels)
  cream: "#f7f3ed"          # primary text on dark
  cream-mute: "#a8a29e"     # secondary text, captions
  amber: "#d4a373"          # primary accent — warm, deliberate
  amber-deep: "#a87c4f"     # accent shadow / hover
  sage: "#7c8b7e"           # secondary accent — calm, success
  copper: "#c25a4f"         # warning / danger (muted, never bright red)
  ink-glow: "#191614"       # near-ink for soft shadows on dark
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

This file is authoritative for every Dirgha surface — CLI, web, video, slides. The YAML frontmatter is machine-readable; the prose tells you why.

## Voice

The product talks like a senior engineer explaining their setup to a peer over a coffee. Direct. Informed. Useful. No marketing flourish.

**Lean in:** sovereign · terminal · deliberate · honest · free.
**Avoid:** cute · revolutionary · synergistic · disruptive · seamless · empowering · unleash · supercharge · "we are excited."

Customer-first means leading with the value and ending with the brand. "Build to last" comes before "Dirgha." "What you can do with this" comes before "what we are."

## Tagline

```
Build to last. Code with Dirgha. Think.
```

Three beats. The first is the value. The second is the action. The third is the philosophy — agents that move fast aren't the same as agents that think well.

## Why these colors

The palette is **warm monochromatic** — black, cream, and a single warm amber accent. It reads like a hardcover technical book, not a SaaS dashboard. Sage green is the quiet "OK" state (test pass, scan clean). Copper is the only red-adjacent value, used sparingly for warnings.

We do NOT use:
- Pure white. Too clinical against the cream.
- Pure red. Alarmist. Copper does the same job with less noise.
- Gradients on text or backgrounds. Flat surfaces only.
- Drop shadows. Inset edges only.

## Why Inter

Inter is the modern UI default for a reason. It was designed by Rasmus Andersson specifically for screens — variable axes, optical sizing, slashed-zero option for code, excellent rendering at small sizes. Vercel, Linear, Figma, and most thoughtful developer tools ship in Inter. We do too.

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

## Naming convention

The product is **Dirgha**. The npm package is `@dirgha/code`. The CLI binary is `dirgha`. "Dirgha Code" disambiguates the CLI from the broader Dirgha ecosystem (gateway, web, mobile) — used at the end of copy, not the start.

Wrong:
> Dirgha Code is a terminal coding agent that …

Right:
> A terminal coding agent that ships working code on free-tier compute. Dirgha Code, on npm.

## Motion

Things appear, settle, and stay. No bouncing, no springs, no looping decoration.

- **Type-on for text** that represents user input or streamed agent output. 30–40 ms per character. Slows on punctuation (50 ms after `.`, `,`, `;`).
- **Fade-in for everything else** — 320 ms with the `ease` curve. Never slide-in from off-screen.
- **No mid-loop motion.** Once on screen, an element doesn't drift, breathe, or pulse. The cursor is the only exception (1 Hz blink).
- **Cuts, not crossfades** between major sections in video. A 600 ms crossfade is a smell.

## Audio

Background for video is a slow ambient drone. Warm, low-mid, not melodic. The reference is somewhere between *Music for Airports* and the hum of a quiet server room. Never upbeat tech-stock — the opposite of the brand.

Spec for promo audio (synthesised in ffmpeg, no licensing):
- Base drone: 110 Hz sine (A2) at -18 dB
- Fifth above: 165 Hz sine (E3) at -22 dB, slow LFO at 0.1 Hz
- Pink noise floor: -38 dB, low-pass at 800 Hz
- 2 s fade-in, 4 s fade-out
- No percussion, no melody, no swells beyond the LFO breath

## How to use this file

Any AI agent or designer working on Dirgha reads this file before producing visuals or copy. The `design-md` skill (installed via `dirgha skills install`) tells the agent: tokens are authoritative, prose is rationale, don't invent values that aren't here.
