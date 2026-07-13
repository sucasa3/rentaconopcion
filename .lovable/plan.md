# SuCasa × GHL × Lofty — Revised Architecture

Adopting your refinement: **GHL owns people + lifecycle marketing. Supabase owns product data.** No pro/vendor pipeline sync from the app, no per-request opportunity mirroring. GHL only sees the homeowner's lifecycle stage.

---

## Part 1 — GHL Homeowner Lifecycle Sync

### What lives where

| Concern | System |
|---|---|
| Homeowner contact record + lifecycle stage | GHL |
| Marketing email/SMS, nurture, re-engagement campaigns | GHL |
| Homes, inspection reports, AI analysis, maintenance, documents, service requests, pros, claims, reviews | Supabase |
| Vendor / Lender / Agent / Enterprise sales pipelines | GHL (manual, not touched by the app) |

### Lifecycle stages the app writes to

Only these six, on the **SuCasa Homeowners** pipeline:

1. `NEW_SIGNUP` — auth account created
2. `ONBOARDING` — profile started but home profile not complete OR no first service yet
3. `ACTIVE_HOMEOWNER` — home profile complete AND (inspection uploaded OR first service booked)
4. `NEEDS_REENGAGEMENT` — no activity 60+ days (batch job flips this)
5. `PREMIUM_MEMBER` — future paid plan flag (wired now, unused until billing lands)
6. `INACTIVE` — soft-deleted / opted-out

Everything else (inspection uploaded, AI complete, vendor recommended, service booked) is a **note or tag** on the GHL contact, not a stage change. That way the pipeline stays clean for marketing while your sales/CS team still sees signal.

### Secrets I'll request

- `GHL_API_KEY` — Private Integration token
- `GHL_LOCATION_ID`
- `GHL_HOMEOWNERS_PIPELINE_ID`
- `GHL_STAGE_NEW_SIGNUP_ID`
- `GHL_STAGE_ONBOARDING_ID`
- `GHL_STAGE_ACTIVE_ID`
- `GHL_STAGE_REENGAGEMENT_ID`
- `GHL_STAGE_PREMIUM_ID`
- `GHL_STAGE_INACTIVE_ID`
- `GHL_WEBHOOK_SECRET` (already generated)

### Backend pieces

1. **`profiles.lifecycle_stage`** column (enum) + `profiles.ghl_last_synced_at`. Existing rows default to `NEW_SIGNUP`.
2. **`ghl_sync_queue`** and **`ghl_sync_state`** tables already exist from the earlier migration — I'll narrow their scope to `entity_type = 'homeowner'` only and drop the pro/request/claim triggers we won't use.
3. **Lifecycle computation** — a Postgres function `compute_lifecycle_stage(user_id)` that reads profile + service_requests + inspection docs and returns the correct stage. Called from a trigger on `profiles`, `service_requests`, and (later) `documents` inserts. Trigger only enqueues a sync job if the computed stage changed.
4. **`src/lib/ghl.functions.ts`** — server functions using `supabaseAdmin`:
   - `drainGhlQueue()` — cron every minute; per queued homeowner: upsert Contact (name, email, phone, city, `sucasa_user_id` custom field, `homeowner` tag) → move to stage → record `ghl_contact_id`. Retries with backoff, records `last_error`.
   - `addGhlContactNote(userId, note)` — used by AI-complete, vendor-recommended, first-service-booked hooks to leave a note without stage change.
   - `resyncHomeowner(userId)` — admin action.
   - `backfillGhl()` — enqueues all existing homeowners.
5. **Nightly re-engagement job** — cron sets `lifecycle_stage = NEEDS_REENGAGEMENT` for active homeowners with no activity in 60 days.
6. **Inbound webhook** `src/routes/api/public/ghl-webhook.ts` — HMAC-verified. Handles unsubscribes / manual stage overrides from CS team: sets `profiles.lifecycle_stage` to match GHL. This is the GHL → App direction; kept narrow (stage + opt-out flags only).
7. **Admin UI** on `/admin` — "GHL Sync" panel: queue depth, last error per homeowner, per-row **Resync** button, one-click **Backfill**.

### What we're explicitly NOT doing

- No GHL Opportunity per service request. Requests live in Supabase; ops team works them in the SuCasa admin.
- No sync of `pros` to GHL from the app. Vendor Partners pipeline is manual sales workflow.
- No lender / agent / enterprise pipeline awareness in code.
- No per-milestone stage moves (inspection uploaded, AI complete, etc.). Those become **contact notes + tags**, not stages.

---

## Part 2 — homes.sucasa.com → Lofty (unchanged)

DNS + Lofty custom domain + in-app links. No app code owns listings.

1. `CNAME homes.sucasa.com → <Lofty target>` at your registrar.
2. Add `homes.sucasa.com` as custom domain in Lofty; SSL auto-provisioned.
3. App linking: header "Homes for Sale" link, homepage CTA, footer link — all external to `https://homes.sucasa.com`.
4. Sitemap mentions the subdomain.

---

## Build order once you approve

1. Request the GHL secrets (Location ID, API key, Pipeline ID, 6 stage IDs).
2. Migration: add `lifecycle_stage` + `ghl_last_synced_at` to `profiles`, drop pro/request/claim sync triggers, add lifecycle trigger, seed existing profiles.
3. `src/lib/ghl.functions.ts` + `src/lib/ghl.server.ts` (REST wrapper) + cron for `drainGhlQueue` and re-engagement.
4. Inbound webhook route.
5. Admin GHL Sync panel.
6. Lofty subdomain links in header, homepage CTA, footer, sitemap.
7. Setup checklist you'll run in the GHL UI (create pipeline, name stages, create custom field `sucasa_user_id`, generate Private Integration token, create webhook workflow with the secret).

Reply "go" and I'll switch to build and start with the secret request.
