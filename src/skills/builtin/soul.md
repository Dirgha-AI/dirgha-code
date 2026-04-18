---
name: soul
description: Create and maintain soul.md — the project constitution that keeps builders on track
trigger: /soul, dirgha init (first run), dirgha login (first run)
---

# Soul.md — Project Constitution

> Dirgha's job is to get you to revenue. Not to make you feel busy.
> soul.md is the document that keeps you honest.

---

## When This Activates

1. **First login ever** — creates `~/.dirgha/soul.md` (builder profile)
2. **`dirgha init` in a new directory** — creates `./soul.md` (project soul)
3. **`/soul` command** — review or update either soul file
4. **Any out-of-scope request** — Dirgha checks soul.md before helping

---

## Builder Profile (`~/.dirgha/soul.md`)

Created once after first login. Captures who you are as a builder.

**Questions (all skippable — press Enter to skip):**

```
1. What kind of builder are you?
   (solo founder / team lead / indie hacker / researcher / student)

2. What stage are you at?
   (idea / MVP / early traction / scaling / profitable)

3. What's your primary goal in the next 90 days?
   (launch / get first customer / reach $X MRR / hire / raise)

4. What do you tend to get distracted by?
   (building features nobody asked for / perfectionism / too many ideas / ...)

5. How many hours/week can you dedicate to building?
```

**Output: `~/.dirgha/soul.md`**

```markdown
# Builder Soul

**Type:** solo founder
**Stage:** MVP
**90-day goal:** Launch and reach $1K MRR
**Known distraction:** Over-engineering
**Weekly capacity:** 20 hours

*Created: YYYY-MM-DD | Updated: YYYY-MM-DD*
```

---

## Project Soul (`./soul.md`)

Created on `dirgha init` or first use in a directory.
Uses the Solve Scale framework (SOLVE stage questions only until traction).

**Questions (all skippable):**

```
1. What are you building? (one sentence)

2. Who is it for? (be specific — not "developers", but "solo founders
   building SaaS who can't afford a dev team")

3. What problem does it solve? (what pain exists without it)

4. What does your MVP look like? (minimum to prove the idea)

5. What's the one metric that matters right now?
   (signups / MRR / DAU / retention / ...)

6. What is your ship date? (be specific — "2 weeks" → actual date)

7. What are you NOT building in this sprint?
   (deliberate exclusion list — keeps you focused)
```

**Output: `./soul.md`**

```markdown
# [Project Name] Soul

**What:** One-sentence description
**For:** Specific customer segment
**Problem:** Pain without this product
**MVP:** Minimum viable description
**North Star Metric:** The one number that matters
**Ship Date:** YYYY-MM-DD
**Not Building:** Explicit exclusion list

## Roadmap Backlog
*(new requests land here, not in the sprint)*

## Decisions Log
*(why you made the calls you made)*

*Created: YYYY-MM-DD | Updated: YYYY-MM-DD*
```

---

## The Scope Guard

When any request comes in, Dirgha checks `./soul.md`:

**If in scope** → help immediately.

**If out of scope** → respond with:
```
⚠ This looks outside your current soul.md scope.

Your ship date is [DATE] and your north star is [METRIC].
This request is about [TOPIC] which isn't in your current sprint.

Options:
  [1] Add to roadmap backlog and continue with current focus
  [2] Help me anyway (I know what I'm doing)
  [3] Show me my current soul.md

→
```

**If soul.md doesn't exist** → offer to create it inline.

---

## Updating soul.md

```bash
dirgha soul                  # review current soul
dirgha soul update           # interactive update
dirgha soul backlog add      # add item to backlog without breaking focus
dirgha soul ship-date <date> # update ship date
```

---

## Bucky Integration

When Bucky agents are assigned to a project, they read `soul.md` to:
- Understand the project context and goal
- Prioritize tasks aligned to north star metric
- Reject or flag tasks that conflict with scope
- Report progress against ship date

The builder's soul.md is Bucky's mission briefing.

---

## Business Model Canvas (Solve Scale)

`/canvas` generates a one-page summary from soul.md answers mapped to the Solve Scale framework:

```
PROBLEM       →  soul.md "problem"
SOLUTION      →  soul.md "what"
VALUE PROP    →  soul.md "for" + "problem"
MVP           →  soul.md "MVP"
METRIC        →  soul.md "north star metric"
SEGMENT       →  soul.md "for"
SHIP DATE     →  soul.md "ship date"
NOT BUILDING  →  soul.md "not building"
```

Use `/solve-scale` to fill in the full framework (revenue, channels, cost structure, etc.) when you're ready to go beyond MVP.
