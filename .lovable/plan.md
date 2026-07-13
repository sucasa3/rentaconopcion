# SuCasa: GHL Sync + Lofty Homes Subdomain

Two integrations. GHL is the real build; the homes subdomain is a DNS + link job now that Lofty already hosts the listings.

---

## Part 1 — GoHighLevel Sync (Private Integration API)

### What syncs

| Trigger in SuCasa | GHL action | Direction |
|---|---|---|
| New homeowner signup / profile update | Upsert Contact, tag `homeowner`, custom fields: city, state, zip, home value | App → GHL |
| New pro signup / update | Upsert Contact, tag `pro`, custom fields: category, service area, plan, membership status | App → GHL |
| New `service_request` | Create Opportunity in "SuCasa Service Requests" pipeline, stage = New | App → GHL |
| `service_request.status` change (assigned/claimed/completed/cancelled) | Move opportunity stage | App → GHL |
| Opportunity stage changed in GHL by sales | Update `service_requests.status` in app | GHL → App |
| Claim accepted/rejected | Update opportunity + add note | App → GHL |

### Backend pieces

1. **Secrets** (requested via `add_secret` when we hit build mode):
   - `GHL_API_KEY` — Private Integration token
   - `GHL_LOCATION_ID`
   - `GHL_PIPELINE_ID` (Service Requests pipeline)
   - `GHL_WEBHOOK_SECRET` — you generate a strong random string and paste it into the GHL workflow webhook + here
2. **New table `ghl_sync_queue`** — `entity_type`, `entity_id`, `op`, `attempts`, `last_error`, `processed_at`. RLS: service_role only.
3. **New table `ghl_sync_state`** — `entity_type`, `entity_id`, `ghl_contact_id`, `ghl_opportunity_id`, `last_synced_at`.
4. **DB triggers** on `profiles`, `pros`, `service_requests`, `claims` → enqueue into `ghl_sync_queue` (never call HTTP from a trigger).
5. **Server functions** in `src/lib/ghl.functions.ts`:
   - `drainGhlQueue()` — run by pg_cron every minute; processes queued rows, upserts contact/opportunity via GHL REST, records IDs in `ghl_sync_state`, backs off on error.
   - `syncHomeownerToGhl` / `syncProToGhl` / `syncRequestToGhl` — internal helpers + manual admin actions.
   - `backfillGhl()` — one-time admin action to enqueue all existing rows.
6. **Inbound webhook**: public route `src/routes/api/public/ghl-webhook.ts`. HMAC-verifies with `GHL_WEBHOOK_SECRET`, maps opportunity stage → `service_requests.status`.
7. **Admin UI** on `/admin`: "GHL Sync" card — queue depth, last error per entity, per-row **Resync** button, one-click **Backfill**.

### Field mapping (created once in GHL, then referenced by ID)

Contact custom fields: `sucasa_role`, `sucasa_city`, `sucasa_home_value`, `sucasa_category`, `sucasa_membership_status`, `sucasa_user_id`.
Opportunity custom fields: `sucasa_request_id`, `sucasa_category`, `sucasa_budget`, `sucasa_timeline`.

I'll produce a short setup checklist for you to run in the GHL UI before we flip it on.

---

## Part 2 — homes.sucasa.com → Lofty (DNS only)

Since Lofty already hosts working IDX search + listing pages, we don't build any of that. We just point a subdomain at it and link into it from the SuCasa app.

### Steps

1. **DNS**: in your domain registrar, add a `CNAME` record for `homes` pointing to the target Lofty gives you (typically something like `<yoursite>.loftywebsites.com` or their masking host — Lofty support confirms the exact target and any TXT verification record).
2. **Lofty config**: in Lofty → Website settings → add `homes.sucasa.com` as a custom domain and let it provision SSL.
3. **App linking**: update the SuCasa app so anywhere we mention listings/search, we link out to `https://homes.sucasa.com`. Specific changes:
   - Header nav: add a "Homes for Sale" link → `https://homes.sucasa.com` (external, opens in same tab).
   - Homepage: add a "Browse homes for sale" CTA section linking to the subdomain.
   - Footer: link under "Buy / Sell".
4. **SEO**: add `<link rel="alternate">` and mention `homes.sucasa.com` in the app's sitemap index so crawlers find it.
5. **No app code owns listings data** — no schema, no cron, no IDX credentials on our side. If you later want listing cards embedded inside the SuCasa dashboard (e.g. "homes near you"), Lofty exposes a JS widget we can drop into a route; out of scope for this plan.

### What I need from you before build

1. Confirm the GHL pipeline name + stages ("New → Assigned → Claimed → Completed → Cancelled") or give me your preferred names.
2. Confirm you'll paste the **GHL Private Integration token**, **Location ID**, **Pipeline ID**, and a **generated webhook secret** when I request them.
3. The CNAME target Lofty gives you for `homes.sucasa.com` (or just tell me "I'll set the DNS myself" and I'll only do the in-app linking).

Reply with those and I'll switch to build and start with GHL.
