---
name: dirgha
tagline: A terminal coding agent. Free compute, full agency.
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
    fontFamily: Fraunces, Georgia, serif
    weight: 400
    optical: 144
    feel: editorial, sovereign, deliberate
    use: titles, hero, section heads
  body:
    fontFamily: Inter, system-ui, sans-serif
    weight: 400
    feel: clean, terminal-adjacent, reads at small sizes
    use: paragraphs, captions
  mono:
    fontFamily: JetBrains Mono, ui-monospace, monospace
    weight: 400
    feel: terminal verbatim
    use: code, commands, output
spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, 2xl: 64, 3xl: 96 }
radii: { sm: 4, md: 8, lg: 12, xl: 16, pill: 999 }
motion:
  ease: cubic-bezier(0.22, 0.61, 0.36, 1)   # decisive, not springy
  fast: 200ms
  base: 320ms
  slow: 600ms
  feel: deliberate. Things move once and settle. No bouncy overshoot.
---

# dirgha — design system

This file is authoritative for every dirgha surface — CLI, web, video promos, slide decks. The YAML frontmatter is machine-readable; the prose below tells you *why* the values exist.

## Tone

dirgha is sovereign infrastructure for engineers who'd rather own their tools than rent them. The tone is direct, terse, and confident — not playful, not snarky, not corporate. Read it and you should think: *deep, deliberate, free, mine*.

Adjectives we lean into: **sovereign · terminal · deliberate · honest · free**.

Adjectives we avoid: cute · revolutionary · synergistic · disruptive · seamless · empowering · unleash · supercharge.

## Why these colors

The palette is **warm monochromatic** — black, cream, and a single warm amber accent. It reads like an old typewriter manual or a hardcover technical book. The sage green is a quieter secondary accent for "calm OK" states (test pass, scan clean, success). Copper is the only red-adjacent value — used sparingly for warnings.

We do NOT use:
- Pure white (`#fff`) — too clinical against the cream.
- Pure red (`#f00`) — alarmist; copper does the same job with less noise.
- Gradients on text or backgrounds — flat surfaces only.
- Shadows beyond `0 0 0 1px ink-glow` for inset edges — no drop shadows.

## Why this typography

**Fraunces** for display sets dirgha apart from every other CLI tool out there. Most ship in Inter or system-ui everywhere — clean but anonymous. Fraunces is opinionated: it has stress, tension, optical-size axes. It says "this is built by someone who thought about the look." We use it for titles only — body and code stay readable.

**Inter** for body is the standard for screen-reading at small sizes. We use the regular weight; bold is reserved for emphasis inside paragraphs and section transitions.

**JetBrains Mono** for code matches the terminal where dirgha actually lives. It's the same typeface most developers see in their editor, so a code sample in our docs feels native, not pasted-in.

## Logo

The wordmark is `dīrgha` set in Fraunces with a **macron over the i** (the "ī"). This is literal: in Sanskrit phonetics, *dīrgha* (दीर्घ) means "long vowel," and the macron is the ASCII transliteration mark for a long vowel. The logo IS the meaning of the word.

Symbol-only mark: `◈` — a four-cusped diamond. Used in CLI prompts (`◈ dirgha · 1.4.0`), favicons, where the wordmark would be too long.

Color usage:
- Wordmark cream-on-ink for dark surfaces (default)
- Wordmark ink-on-cream only for printed materials
- Macron always one shade lighter than the wordmark — so it reads as a deliberate diacritical, not a typo
- Symbol amber-on-ink for accent moments (the cursor blink, the "spinner" in CLI)

`assets/logo/` contains:
- `dirgha-wordmark-cream.svg` — primary
- `dirgha-wordmark-ink.svg` — for cream backgrounds
- `dirgha-mark-amber.svg` — symbol only, accent
- `dirgha-mark-cream.svg` — symbol only, monochrome

## Motion principles

dirgha animates the way a well-designed terminal feels: things appear, settle, and stay. No bouncing, no springing, no looping decoration. Specific rules:

- **Type-on for text** that represents what the user typed or what the agent streamed. 30-40 ms per character. Slows down on punctuation (50 ms after `.`, `,`, `;`).
- **Fade-in for everything else** — 320 ms with the `ease` curve. Never slide-in from off-screen.
- **No mid-loop motion** — once an element is on screen, it doesn't drift, breathe, or pulse. The cursor is the only exception (1 Hz blink).
- **Cuts, not crossfades** between major sections in a video — same rule as good documentary editing. A 600 ms crossfade is a smell.

## Audio

Background music for dirgha video promos is a slow ambient drone in the same register as the design feel — warm, low-mid, not melodic. The reference is something between a Brian Eno *Music for Airports* texture and the hum of a quiet server room. **Never** upbeat tech-stock music; that's the opposite of the brand.

Spec for promo audio (synthesised in ffmpeg, no licensing required):
- Base drone: 110 Hz sine (A2) at -18 dB
- Fifth above: 165 Hz sine (E3) at -22 dB, slow LFO at 0.1 Hz
- Light noise floor: pink noise at -38 dB, low-pass at 800 Hz
- Soft fade-in 2 s, fade-out 4 s
- No percussion, no melody, no swells beyond the LFO breath

## How agents use this file

Any AI agent working on dirgha — including dirgha itself when building its own marketing — reads this file before producing visuals. The `design-md` skill (installed via `dirgha skills install`) tells the agent: tokens are authoritative, prose is rationale, don't invent colors or fonts that aren't here.
