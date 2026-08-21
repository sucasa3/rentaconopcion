# Fix: assistant search returns nothing

## What's wrong

The search is speaking a different vocabulary than the data.

Confirmed against the live database:

- Opportunity strength is stored as `strong` / `moderate` / `emerging`. The search
  translates "potential sellers" into intent `high`, which matches **zero** rows.
- Opportunity categories are `equity`, `refinance_review`, `heloc`, `move_up`,
  `investment`, `home_condition`, `mortgage_review`. The search translates "sellers"
  into `sell`, which doesn't exist, so that filter also matches zero rows.
- Equity in the search is re-estimated from the loan amount at closing. Only 450 of
  1,063 clients have a loan amount, so 613 clients get an equity of $0 and fail any
  "$100,000+ equity" test — even though the real equity is already stored on the
  opportunity record (for example one client shows $164,184 there).

Combined, "clients with at least $100,000 in equity who are potential sellers"
applies three filters that each independently eliminate everyone.

## The fix

1. **Read the real numbers.** For each client, take equity, value, balance, rate and
   monthly savings from the stored opportunity signals — the same numbers shown on the
   portfolio and client detail pages. Only fall back to the estimate when a client has
   no opportunity record yet, and never let a fallback of $0 silently exclude someone
   from a "no maximum" equity question.

2. **Speak the real vocabulary.** Map what people say to what's stored:
   - "high intent", "hot", "likely sellers" -> `strong`; "medium" -> `moderate`;
     "low"/"early" -> `emerging`.
   - "seller", "selling", "moving", "move up" -> `move_up`
   - "refi", "refinance" -> `refinance_review`; "rate review" -> `mortgage_review`
   - "cash out", "HELOC", "tap equity" -> `heloc`
   - "equity" -> `equity`; "maintenance", "condition", "repairs" -> `home_condition`
   - "investor", "investment property" -> `investment`
   A question about sellers matches `move_up` **or** high-equity sell-side signals
   rather than one narrow category.

3. **Never show a blank screen.** When a question matches nothing, the result panel
   explains which condition eliminated everyone ("no clients are tagged as likely
   sellers; 214 have $100k+ equity") and offers one-tap chips to drop the failing
   condition.

4. **Show the numbers that were asked about.** Equity, rate and intent columns render
   from the same stored signals, so the card list agrees with the client detail page.

## Technical notes

- `src/lib/copilot.functions.ts`: select `signals` alongside category/strength/score
  from `homeowner_opportunities`; merge the richest signal per client and prefer those
  values over the local `estimatedValueCents` / `remainingBalanceCents` math. Keep the
  existing org-scoped, RLS-protected query path unchanged.
- `src/lib/copilot.server.ts`: replace the `high|medium|low` intent enum with
  `strong|moderate|emerging|any`, rewrite `CATEGORY_ALIASES` to the seven real
  categories, allow a category set (not a single value) so "sellers" can match
  `move_up` plus equity-driven sell signals, and update the system prompt with the
  real category and strength names.
- Add a diagnostic pass in `applyFilter` that reports per-condition match counts so
  the empty state can name the blocking filter.
- `src/components/copilot-search.tsx`: render the empty-state explanation and the
  relax-condition chips.
- No schema changes, no migration.
