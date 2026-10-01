# Agent Discovery + Upsells (Workstream 2) — plan for review

Plan only. No code, pricing, or Stripe changes until you approve each phase.

## 1. What exists today (audited)

| Area | Current state |
|---|---|
| Agent free tier | 100 Home Profiles per agent org (`agent_base_profile_limit` = 100, source locked to "sucasa"; lenders can never fund it). Kept as is. |
| Agent paid plans | Agent $49/mo (250), Agent Growth $99/mo (1,000). Old unused tiers still in the table (Agent Core/Plus/Pro). |
| Agent CSV import | Imports up to the remaining allowance and says how many were held back. Skips opted-out/deleted people. **No same-book duplicate check** (the lender importer got one last release). |
| Lender Discovery | Free run (allowance), ranked preview, locked category counts, activation by Stripe webhook, "Upload My Full Database" with dedupe. Abuse signals: same property set, same person across orgs, shared email domain (signal only, never a block). |
| Enrichment | One shared property record per address; background queue; refresh windows: value 90 days in background (30 on demand), mortgage 180, permits 90, sales/owner 365, building facts 10 years. Archived profiles never refresh. |
| Sign-up verification | Email link only. No phone verification anywhere. |
| Reverse lookup (contact to home) | Not built. BatchData contact/skip-trace access is unconfirmed. |

## 2. User flow

```text
/agents  ->  "See who in your book is ready to move"  ->  sign up (email + phone code)
   -> upload CSV/CRM export (address OR name+email/phone)
   -> matching screen: matched / needs address / duplicates / opted out
   -> Discovery results (within the free 100):
        top conversations unlocked (who, why now, 30-Second Brief)
        rest of the 100 shown as locked counts by reason (no names)
   -> "Unlock my full book" -> plan picker (250 / 1,000 / team)
   -> Stripe checkout -> webhook activates -> import the rest (deduped)
   -> ongoing: Agent Today + monthly refresh within plan
```

Rows without an address go to a "Find the home" step (reverse lookup). That step is paid per match and only offered once the lookup source is verified (Phase 0).

## 3. Proposed entitlements

| Plan | Price (proposed) | Home Profiles | Discovery | Reverse lookups included | Refresh |
|---|---|---|---|---|---|
| Free | $0 | 100 (unchanged) | 1 free run, top 3 unlocked, rest as counts | 0 (address rows only) | Standard windows above |
| Agent | $49/mo | 250 | Full results | 50 one-time | Standard |
| Agent Growth | $99/mo | 1,000 | Full results | 200 one-time | Standard |
| Team (new, for review) | $249/mo | 2,500 shared, up to 5 seats | Full, per seat | 500 one-time | Standard |
| Extra reverse lookups | pack (for review) | — | — | 100 per pack | — |

Rules:
- A Home Profile counts against the allowance once, no matter how many times it's uploaded.
- Reverse lookup is charged only when it returns a match. No match = no charge to the agent.
- Downgrade or cancel: profiles above the new limit are archived (they stop refreshing) and are never deleted.

## 4. Cost model

**Verified from our records:**
- 65 property lookups logged, 64 different addresses, $6.40 total, so about **$0.10 per new home**. Zero were served from our saved copy yet.
- Saved record windows (above) are in code, so a home already looked up within the window costs $0.
- Internal setting says $0.0155 per property. That doesn't match the $0.10 we were actually charged; it needs correcting before any margin math is used.

**Assumptions (to confirm with BatchData in Phase 0):**
- Reverse lookup (contact to address) price: assumed $0.10–$0.25 per match; access not yet confirmed.
- Ongoing refresh: value every 90 days plus mortgage every 180 is about 6 lookups per home per year. If each is billed like a full lookup, that's about **$0.60/home/year**. If BatchData bills a lighter value-only call, it's lower.

**Per-plan estimate (worst case, full lookup price):**

| Plan | Starting cost (one-time) | Refresh per month | Revenue per month |
|---|---|---|---|
| Free (100) | ~$10 | ~$5 | $0 |
| Agent (250) | ~$25 + up to $12 reverse | ~$12.50 | $49 |
| Growth (1,000) | ~$100 + up to $50 reverse | ~$50 | $99 |
| Team (2,500) | ~$250 + up to $125 reverse | ~$125 | $249 |

Growth and Team margins are thin on worst-case refresh. Options for you to choose between: a slower refresh for quiet homes (no activity in 6 months goes to every 180 days), or adjusted prices. Free-tier cost (~$10 start, ~$60/year) is the acquisition cost per agent.

**Duplicate-call protection:** one shared record per address across all accounts; a valid match within its window is reused for any agent or lender; failed matches are remembered so the same bad address isn't paid for twice; the importer skips homes already in the book.

## 5. Repeat free trials vs. real teams

- Free Discovery is tied to a **verified phone number** (new) plus the person's account, not just the email.
- Same phone, same person, or the same property set already given a free run: the new account still works, but gets no second free run and no second free 100. Their homes reuse the existing records ($0 cost).
- Shared email domains (brokerages, teams) are recorded as context only, never a block. Same as lender.
- Teams: a team owner invites agents into one org. They share the paid pool. Each agent keeps their own book and relationships. A team agent who leaves takes their own free 100 with them; the team keeps paid capacity.
- An admin review list shows flagged accounts. Nothing is blocked automatically except the second free run.

## 6. Implementation phases

0. **Verify (no build):** confirm BatchData reverse-lookup access and price, and refresh-call pricing; fix the internal cost setting; you approve the prices.
1. **Importer safety:** same-book duplicate skip for agent uploads (reusing the lender rule: same street + ZIP, or same email); report skipped rows; tests.
2. **Phone verification + one-free-run rule:** text-message code at agent sign-up; risk signals reused from lender Discovery; admin flag list.
3. **Agent Discovery run:** reuse the lender Discovery engine and Agent Today's ranking (no new scoring); free preview (top 3 + locked counts); funnel tracking.
4. **Upgrade path:** plan picker, Stripe checkout (test mode in preview), webhook activation, "import the rest"; tidy the unused agent tiers.
5. **Reverse lookup** (only if Phase 0 confirms access): "Find the home" step, charged on match, included lookups plus packs.
6. **Team plan and refresh economics:** shared pool, seats, quiet-home slower refresh, cost dashboard for admins.

Each phase is built in preview, tested, and published only after your review.

## Technical notes
- Entitlements continue in `agent_base_entitlements` (source = sucasa) plus `plan_tiers`; new columns for reverse-lookup credits and a phone-verified flag; the free run is recorded on a discovery row per org (unique), the same as `lender_discoveries`.
- Reuse `discovery.server.ts` (`planIntake`, `assessRisk`, `propertySetHash`, `finalizeDiscovery` with the agent read of top reviews) instead of a second engine.
- Every paid call keeps going through the shared property record and `batchdata_call_log` with `revenue_source` (`agent_discovery`, `agent_reverse_lookup`, `background_refresh`), so starting and ongoing costs are reported separately.
