# SuCasa as the digital layer for the physical home — roadmap

First: I'll store the thesis as persistent project memory (Kalanick atoms framing, the CPU/storage/network architecture, the digital-twin contents, the moat, and the monetization stance) so it shapes every future decision without you restating it.

Then the roadmap below maps what exists today against that model and names the gaps.

## The model

```text
HOUSE (atoms)
  -> DIGITAL HOME PROFILE      = storage
  -> SUCASA INTELLIGENCE       = CPU  ("what should happen next?")
  -> PARTNER NETWORK           = network (agent / lender / vendor / insurer / investor)
  -> PHYSICAL ACTION           -> profile updates, loop repeats
```

## Where we stand against it

**Storage — partly built.** Property records, valuation/equity, permits, tax, inspection findings, maintenance history and homeowner activity all exist, but they live in separate tables and separate panels. There is no single Home Record object that says "this is the house, everything known about it, in one shape."

**CPU — scattered.** Home score, move-intent, seller-intent, refi signal, next-suggested-step and maintenance rules each compute independently in their own module. There is no one engine that reads the whole record and emits a ranked list of "what should happen next."

**Network — built per-role, not per-signal.** Lender network, agent network, opportunities board, vendor/pro claiming, campaigns. Each is reachable, but routing is manual or role-scoped rather than driven by a signal coming off the home.

**Loop closure — missing.** After a service, refi or sale, nothing writes the outcome back onto the home record, so the twin does not get smarter with use — which is exactly where the moat is supposed to come from.

## Roadmap

### Phase 1 — One Home Record (storage)
A single canonical home object, keyed by normalized address, that every role reads from: property, financial, physical, behavior. Homeowner, agent and lender views all render the same record; no view re-derives its own numbers. Completeness is measured per home and per section, so gaps become a visible worklist instead of silent blanks.

### Phase 2 — One signal engine (CPU)
Fold the existing scattered scores into a single evaluator that runs on the home record and emits typed signals with confidence, reason and freshness — e.g. "roof approaching replacement", "equity above threshold", "rate spread favours refi", "owner checked equity three times", "insurance renewal near". Every card in every dashboard renders from that signal list. Adding a new opportunity type becomes adding a rule, not a new panel.

### Phase 3 — Signal-driven routing (network)
Each signal type declares which network it fires into and what qualifies a professional to receive it. A roof signal becomes a vendor opportunity, an equity signal a lender opportunity, an intent signal an agent opportunity — all through the one existing opportunity pipeline, with homeowner consent gating the handoff.

### Phase 4 — Close the loop
Outcomes write back: work completed resets component age, a refi updates the loan position, a sale closes the record, a declined suggestion suppresses that signal. This is what makes the twin improve with use.

### Phase 5 — Conversational surface
"SuCasa, what does my house need?" answered from the signal list rather than free-form generation, so the assistant speaks the same truth the dashboards show and can act on it.

### Phase 6 — Access-based monetization
Reframe pricing around qualified access to signals rather than seats: professionals subscribe to signal types in a geography, and the record shows which access produced which outcome.

## Technical notes

- Phase 1 introduces a `home_record` read model assembled server-side from the existing property, inspection, maintenance and activity tables; existing panels switch to it rather than querying independently.
- Phase 2 replaces direct use of `home-score.ts`, `refi.ts`, `opportunities.ts`, `next-step.ts` and `maintenance-rules.ts` at call sites with one evaluator that imports them as rules and returns a persisted, versioned signal set.
- Phase 3 extends `homeowner_opportunities` with a signal reference and routing policy per signal type; campaigns fire from signals rather than cadence alone.
- Phase 4 adds outcome events on the home record, consumed as suppression and recency inputs by the evaluator.
- Enrichment stays as built: one property, one profile, background engine, no duplicate provider calls.

## Suggested order

Phase 1 and 2 are the ones that actually change the product's nature; 3 onward compounds on them. I'd do 1 and 2 next, and keep everything else running unchanged while they land.
