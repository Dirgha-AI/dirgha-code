# Dirgha Code — 90-second video script

## Section 1: Hero one-liner

Codes across 17 providers with failover.

---

## Section 2: 90-second scene plan

Silent video. No voiceover. Audio: 110 Hz + 165 Hz drone per DESIGN.md spec.

| time | scene | content | text on screen | voiceover | rationale |
|------|-------|---------|----------------|-----------|-----------|
| 0:00–0:05 | Hero | Black screen. One-liner fades in: Inter Display 600, tight tracking, amber on ink. | Codes across 17 providers with failover. | none | Pattern 1: verb-led one-liner, 7 words. |
| 0:05–0:08 | Relationship | Subhead appears below in Inter Body 400, cream. | A coding agent that doesn't blink when a model dies. | none | Relationship name at ~0:08 per brief. |
| 0:08–0:25 | Terminal demo | Real terminal capture: `dirgha "fix the parser bug" -m haiku`. Show tool calls, file diffs, tests passing. No mock. | `dirgha "fix the parser bug" -m haiku` | none | Pattern 4: live screencast. 17s. |
| 0:25–0:39 | Differentiator 1: 17 providers | Show `config.yaml` with 17 provider keys stacked. Cut to a 429 error, then automatic switch to next provider mid-turn. | 17 providers. Automatic rotation on 429. | none | BYOK with cooldown rotation. |
| 0:39–0:53 | Differentiator 2: Failover | Anthropic API blip error. Swap to registered backup. Transcript resumes from partial turn—no lost work. | Mid-session failover. Resumes from partial transcript. | none | Failover with transcript resume. |
| 0:53–1:07 | Differentiator 3: Skill scanning | Skill install runs. Security scanner activates. Red flags appear: 2 critical issues caught in 112 installed skills. | Every skill scanned before it runs. 2 critical issues caught. | none | Heuristic prompt-injection scan at install. |
| 1:07–1:21 | Differentiator 4+5: KB + Plugins | Split screen. Left: OpenKB builds wiki from repo docs/decisions. Right: `.mjs` plugin file, 20 lines, registers tool/slash/hook. | Compiled knowledge base. TypeScript plugins in 20 lines. | none | KB reasons over repo; plugins in npm packages. |
| 1:21–1:23 | Number panel | Three numbers, Inter Display, amber, spaced with ` · ` (mid dot). | 17 providers · 40/40 tests · 0 sum-of-gaps | none | Pattern 2: specific numbers as social proof. |
| 1:23–1:25 | Install | Command line in JetBrains Mono, cream, on ink background. | `npm i -g @dirgha/code` | none | Pattern 6: one-line install visible. |
| 1:25–1:30 | CTA | Closing card. Wordmark `Dirgha` (Inter Display 600). Tagline. Repo URL. | Build to last. Code with Dirgha. github.com/dirgha/code | none | CTA per brief. Two beats + URL. |

Total: 90 seconds.

---

## Section 3: Leader patterns and Dirgha differentiators per scene

| scene | leader pattern used | Dirgha differentiator surfaced |
|-------|-------------------|-------------------------------|
| Hero | 1 — Verb-led one-liner | None (positioning only) |
| Relationship | N/A — relationship name | Anchors to failover differentiator |
| Terminal demo | 4 — Live screencast in hero | Proves the agent works; implies all 5 |
| 17 providers | 2 — Specific numbers | #1: Multi-key BYOK with cooldown rotation |
| Failover | N/A — concrete moment | #2: Mid-session failover with transcript resume |
| Skill scanning | N/A — concrete moment | #3: Skill security scan at install and load |
| KB + Plugins | N/A — concrete moment | #4: Compiled knowledge base + #5: TypeScript plugins |
| Number panel | 2 — Specific numbers | Supports all (17 providers, 40/40 tests, 0 gaps) |
| Install | 6 — One-line install | BYOK framing (npm install, bring your own keys) |
| CTA | N/A — closing card | Tagline from DESIGN.md |

---

## Section 4: Self-score

Scored 1–10 on five dimensions:

| dimension | score | reasoning |
|-----------|-------|-----------|
| (a) Hero satisfies a developer in 5s | 9 | "Codes across 17 providers with failover" — a developer sees action verbs, a number, and a reliability claim in one glance. |
| (b) Founder sees defensibility | 9 | BYOK, skill scanning, failover, and KB are all shown as concrete moments. No architecture diagrams. |
| (c) Investor sees the specifics | 9 | 17 providers, 40/40 tests, 0 sum-of-gaps, 2 critical issues caught, 112 skills scanned — all specific numbers on screen. |
| (d) Stays under 90s | 10 | Exactly 90 seconds. No scene overflows. |
| (e) Producible from existing tokens + audio + assets | 9 | Uses only DESIGN.md tokens (Inter, JetBrains Mono, amber, cream, ink). Audio spec is in DESIGN.md. Needs real terminal capture and config file shots, which exist in the repo. |

**Average: 9.2 / 10**

The 1-point deductions: (a) no provider names shown in hero; (b) skill scanning moment may need custom capture; (c) 112 skills number appears only in scene 6, not the number panel; (e) terminal demo must be a real recording, not a mock—adds production friction.
