# Lender Today → Daily Intelligence

A presentation and hierarchy upgrade to the lender Today screen. No changes to access classification, permissions, ranking, compliance language, briefs, outcomes or sponsorship privacy.

## What changes

**Modified components**
- `src/components/lender-today.tsx` — the bulk of the work: greeting + intelligence statement, new hero summary, restructured SuCasa Daily Read, new "Start here" spotlight, progress loop, quiet-day state, renamed proof-of-value section.
- `src/components/lender-contact-card.tsx` — a lighter collapsed card (rank · name · review type · why now · recommended action · Prepare me + permitted channel buttons), with property metrics and permission detail behind existing disclosure.
- `src/components/lender-brief.tsx` — CTA/framing only ("Prepare me" / "30-second relationship brief"), plus a richer post-outcome success state built from the server's real `confirmation`, `nextStep` and `dueAt`. Brief content and logic untouched.

**Server (small, additive)**
- `src/lib/lender-workspace.server.ts` — add two derived fields to the existing return:
  - `metrics.handledToday`: count of today's queue clients that already have an `opportunity_outcomes` row with `occurred_at` on the current day. Outcomes are already loaded in the same query; this is a count, not a new read.
  - `lender.firstName`: from the signed-in user's existing profile record, used only for the greeting. Omitted (and the greeting drops the name) if unavailable.
- No schema change. No new server function. `getLenderWorkspace` stays the single source.

## Reused, unchanged
`metrics` (needsAttentionToday, askedToConnect, followUpsDue, engagedThisMonth, homeownersMonitored, changesDetected, reviewOpportunities), `counts`, `take`, `daily` / `dailyTotal` / `queue`, `askedToConnectList`, `serviceDelivery`, `aggregateOnly`, plus `getLenderQuickBrief`, `generateHomeownerReviewBrief`, `logLenderOutcome`, `lender-daily.ts`, `lender-access.ts`, `contact-channels.ts`, `money.ts`.

## Key decisions

**"Handled today"** — counted only from real `opportunity_outcomes` rows dated today for clients in today's queue. Nothing inferred from views, opens or drawer interactions. Progress reads "3 of 10 handled"; after an outcome the workspace query invalidates and the number moves.

**"Start here"** — `daily[0]` exactly as the existing ranking already ordered it. Presentation only; `compareDaily` / priority engine untouched, and no score is shown or invented.

**Sponsored-only anonymity** — the spotlight and all cards render only from `daily`/`queue`, which the access gate already restricts to named-permitted homeowners. Sponsored-only homeowners continue to appear solely inside `aggregateOnly` / `serviceDelivery` counts in "SuCasa working for you", never named, with the existing caption that sponsorship does not grant individual access.

**Mobile** — single column, one primary action per card, spotlight full-width above the list, hero as one featured number with supporting lines rather than a 2×2 KPI grid, tap targets ≥44px, disclosure instead of density. Wider screens get the same order with more breathing room.

## Honesty limits (statements we will NOT make)
- No "overnight" or "since yesterday" changes. Review detection has no per-day changed-since timestamp, so the intelligence line says "SuCasa reviewed 847 homeowners and found 6 relationships worth your attention today" — never "changed overnight".
- "3 relationships showed meaningful signals" maps to real review counts on today's list; if a metric is zero its line is omitted rather than padded.
- "Good morning" adapts to local time of day; the name appears only when the profile actually has one.
- Quiet day: "Your book is in good shape today — nothing needs immediate attention. SuCasa is monitoring N homeowners and will surface the next meaningful moment." N is `homeownersMonitored`.

## Explicitly not done
No ranking change, no new scores, no gamification/streaks/confetti, no widened visibility, no automatic outbound contact, no new design system — existing SuCasa tokens only.
