# ATTOM 1,000-Lead Batch Enrichment — Architecture Audit

No code was changed. This is findings + recommended architecture.

## Short answer

Yes — SuCasa already has a real background batch engine (queue + cron worker + cache + budget cap), so a 1,000-lead CSV does **not** require anyone to open a page. But three things break it today: the provider account has auto-disabled the core datasets after repeated 401s, the cache key is the raw address string (so the same house can be bought twice), and two-thirds of every outbound request we have ever made was wasted on errors.

## 1. What exists today

| Piece | Where | State |
| --- | --- | --- |
| Provider client | `src/lib/attom.server.ts` | 9 datasets, per-dataset TTLs (profile/assessor 10 yrs, value 30 d, mortgage 180 d) |
| Cache + budget gate | `src/lib/valuation.server.ts` | Postgres cache `property_intel`, per-call log, monthly cap, "known-empty" suppression |
| Queue | `property_enrichment_queue` | Row per portfolio client, priority, attempts, retry backoff, `needs_review` |
| Auto-enqueue | DB trigger on `lender_portfolio_clients` insert | Every imported lead is queued automatically |
| Worker | `runEnrichmentTick` in `enrichment.server.ts` | Batch ≤25, cached-first, stuck-row reaper, budget envelope (70% of tier) |
| Scheduler | pg_cron `property-enrichment-tick`, every 2 min, batch 25 | Active |
| Progress UI | `EnrichmentQueueStrip` + coverage function | Total / covered / queued / needs-review / % |

Live numbers pulled during this audit: 1,063 portfolio clients, 946 distinct addresses, 479 cached properties, queue 1,013 done / 50 needs-review, 1,897 calls used this month against a 5,000 tier.

## 2. The 1,000-lead scenario, as it runs today

1. CSV upload inserts 1,000 rows → trigger queues 1,000 jobs instantly (asynchronous; no timeout risk at upload).
2. Cron drains 25 every 2 minutes → **750/hour, so ~80 minutes** for 1,000 leads. Nothing is synchronous, nothing depends on a page being open.
3. Per lead the worker asks for 4 datasets (profile, value, permits, mortgage) and sometimes a 5th (sale history) → **~4,000–4,500 provider reports** for a clean 1,000-lead file.
4. That exceeds the background envelope (70% of a 5,000/month tier = 3,500), so the run parks itself partway and reports `background_cap`. It resumes on the next tick/month — resumable, but silently incomplete.
5. Unmatched or address-incomplete rows go to `needs_review` with a reason, retried once with 6-hour backoff, then parked. Nothing loops forever.
6. There is **no provider-side batch endpoint** in use — the provider's standard property API is one address per HTTP request. 4,000 reports = 4,000 HTTP requests, issued serially inside each 25-row tick.

Risks at that shape: each tick does up to ~100 sequential outbound calls inside a single worker request — the largest timeout exposure in the system. Rate limits are not an issue at 25 rows/2 min; the monthly report allowance is the real ceiling.

## 3. What is actually burning reports

Measured from `attom_call_log`: **1,990 successful live calls vs 3,980 failed live calls** — 67% of all outbound traffic produced nothing.

Root causes, in order of cost:
- **1,776 calls** rejected with "Address1 and Address2 are required" — the lender enrichment path sent street-only addresses before the local pre-flight check existed. Fixed later (543 rows now blocked locally for free), but the pattern shows any new call site can reintroduce it.
- **~1,100 "SuccessWithoutResult"** responses — the property genuinely has no coverage. Now suppressed for 180 days via `property_intel_misses` (1,008 rows), so these are mostly one-time.
- **Cache key is the normalized address string, not a property identity.** `123 Main St, Miami, FL 33101` and `123 Main Street, Miami FL` are two cache rows and two purchases of the same house. With 1,063 clients over 946 distinct addresses and only 479 cached properties, duplicate-identity spend is real.
- **Dataset fan-out.** Sale history and assessor/tax are pulled as conditional extras and value has a two-attempt fallback (canonical address, then property id), so one lead can cost 4–7 reports.
- **44 × 401 Unauthorized** tripped the auto-disable guard: `detail`, `avm`, `tax`, `mortgage`, `sales` are all currently `enabled = false` in `attom_endpoint_health`. **Enrichment is effectively inert right now** — this is why new profiles come back empty.

What is *not* happening: page loads do **not** buy data. All `dashboard_*` traffic in the log is cache hits; homeowner/agent/lender screens read cache only. Manual "enrich" buttons on the portfolio pages do spend, and the queue strip auto-enrolls unqueued homes on mount, but that only enqueues — it doesn't call out.

## 4. Recommended architecture

```text
CSV upload
  → normalize + verify address (free geocode, before any purchase)
  → resolve property identity  (address hash -> property_id)
  → dedupe against properties already held
  → enqueue jobs keyed by PROPERTY, not by lead
  → cron worker, small bounded batches, single-flight lease
  → Stage A: identity + value + permits   (every property)
  → Stage B: mortgage / sale history      (only when a signal needs it)
  → write to shared Home Record, mark lead enriched
  → recompute opportunities for touched books
  → live funnel counters back to the uploader
```

Changes against what exists:
- **Property identity table.** Cache keyed on a canonical address hash plus the provider's property id, with a lead→property join. One house = one purchase, forever, across every agent and lender book.
- **Queue on property, fan out to leads.** Two agents holding the same address share a single job.
- **Two-stage datasets.** Stage A is the always-buy core; mortgage and sale history become Stage B, bought only when equity/refi/seller logic actually needs them for that property.
- **Concurrency inside the tick** (4–6 in flight) instead of serial, with a per-tick wall-clock budget so the worker always returns before the platform timeout, plus a lease row so two ticks never overlap.
- **Adaptive batch size** driven by remaining monthly allowance rather than a fixed 25.
- **A real funnel counter** per upload: uploaded / matched / enriched / processing / unmatched, sourced from the queue and the property table — the coverage strip today reports coverage, not the five-number funnel you asked for.
- **Reauthorize before anything else.** While the core datasets are auto-disabled, no architecture change produces data.

## 5. Cost policy

- Buy once per property: identity, assessor/profile, permits. Effectively permanent — never re-buy.
- Buy on a clock: valuation (30 d on demand, 90 d in background). Already implemented.
- Buy on demand only: mortgage, sale history, owner, neighborhood, risk — triggered by a screen or a signal that needs them, not by import.
- Never re-buy a known-empty answer (already implemented, keep it).
- Progressive over immediate: enrich activated homeowners and recently active leads first (the worker already reprioritizes), then drain the tail across days rather than blowing a month's allowance on one upload.
- Expected steady-state cost for a clean 1,000-lead file under the two-stage policy: ~2,000–2,500 reports on first pass instead of 4,000–4,500.

## 6. Verdict

**A. Can do today** — background queue, cron worker, resumable processing, retry with backoff, per-dataset TTL cache, known-empty suppression, monthly budget cap with auto-pause, per-call logging, needs-review list with reasons, progress UI. Enrichment does not require anyone to open a page.

**B. Cannot do today** — no property-identity dedupe (address-string cache only), no per-upload funnel counters, no concurrency or wall-clock guard inside a tick, no single-flight lease, no staged dataset policy, and 1,000 leads exceed the monthly envelope in one pass.

**C. Current inefficiency** — 67% of all outbound calls failed; malformed addresses, unmatched properties, duplicate address spellings, dataset fan-out, and a credential/entitlement failure that has now disabled the core datasets.

**D. To support 1,000-lead batches** — restore provider entitlement; add property-identity dedupe; queue by property; split Stage A/Stage B datasets; add bounded concurrency plus lease and time budget in the worker; add funnel counters to the upload result.

**E. Complexity: Medium.** The hard parts (queue, cron, cache, budget, retry, review) already exist. This is a keying and policy refactor, not a new subsystem — roughly one focused build phase.

**F. Recommended architecture** — as in section 4.

**G. ATTOM vs BatchData** — keep ATTOM for the per-property Home Record; it is what the whole valuation/permit/equity layer is built on, and swapping providers would not fix any of the four real defects above. Evaluate BatchData (or a bulk file delivery from ATTOM) specifically for *bulk list ingestion*: if you routinely load thousands of leads at once, a true batch/append product is cheaper per record than 4 single-address API reports. The clean shape is bulk append for first-pass identity + basic property facts, ATTOM on demand for valuation, permits and mortgage depth.

## Next step

Nothing here is built yet. Confirm which you want first: (1) restore provider access and re-enable the disabled datasets, (2) the identity/dedupe + staged-dataset refactor, or (3) the upload funnel counters.
