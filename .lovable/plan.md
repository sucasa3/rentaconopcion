# Activate the GHL connection end-to-end

## Status today
- GHL is **coded and credentialed** (17 secrets stored: API key, location, homeowners pipeline + 6 stages, service-leads pipeline + 4 lead stages, webhook secret).
- DB triggers auto-enqueue sync jobs on every profile / pro / service-request / claim change.
- **But nothing has ever synced.** `ghl_sync_state` is empty (0 rows). The queue holds 44 pending jobs, all `attempts = 0` / `last_error = null` → the drain has never run. Nothing is calling `/api/public/ghl/drain` on a schedule.

## Recommendation: pg_cron (easiest, already in use)
You already have a working pg_cron job — `sucasa-leads-tick` (every 5 min) — that calls `/api/public/leads/tick` using the `apikey` header (the Supabase anon key). The GHL drain should mirror that exactly. No external scheduler, no GHL-workflow setup, no new secret. Same database-side scheduler that already runs reliably.

## The plan

### 1. Switch the drain route to the apikey pattern (match `leads.tick.ts`)
`src/routes/api/public/ghl.drain.ts` currently requires an HMAC signature header (`x-cron-signature` over the body with `GHL_WEBHOOK_SECRET`). Replace it with the same `apikey` check `leads.tick.ts` uses (`apikey` header == `SUPABASE_PUBLISHABLE_KEY`). This keeps one consistent auth pattern and removes the fiddly HMAC requirement.

### 2. Schedule the GHL drain via pg_cron (run via `supabase--insert`)
One SQL insert, identical in shape to the existing leads-tick job, every **2 minutes**:
```sql
SELECT cron.schedule(
  'sucasa-ghl-drain',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--94429f0c-1687-4b34-81a7-6195279589c3.lovable.app/api/public/ghl/drain',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_dvSA_Juhtj_ETiv5x_iPxQ_mr3rRu-M"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

### 3. Extend the drain to sync pros + service requests (not just homeowners)
`drainGhlQueue` in `src/lib/ghl.functions.ts` filters `entity_type = 'homeowner'`, so the queued `pro` and `service_request` rows are never processed — pros and claimed leads never appear in GHL. Add handlers for those two types:
- **pro**: upsert a GHL contact for the pro (business name, phone, email, category, coverage) so pros show up for comms + billing tags; store the GHL contact id in `ghl_sync_state` with `entity_type = 'pro'`.
- **service_request**: create/move the service-lead opportunity in the service-leads pipeline (the homeowner must already have a GHL contact from step 1's homeowner sync — if not, skip and retry next tick).

### 4. De-duplicate queue rows (stop redundant GHL calls)
Today every insert *and* update fires the trigger separately → 42 homeowner jobs for 17 distinct homeowners. Add a guard so the drain processes only one job per `entity_type + entity_id` per pass (mark the duplicates processed without calling GHL), and switch the enqueue function to an idempotent upsert so rapid edits coalesce to one pending job.

### 5. Verify
- Run the drain once (admin "Drain now" button or hit the endpoint) and confirm `ghl_sync_state` populates and GHL contacts/opportunities appear.
- Confirm the pg_cron job shows in `cron.job` and the queue drains over the next few ticks.
- Confirm pros and a claimed service request create GHL contacts/opportunities.

## What you'll need to do (after I build)
- Confirm the GHL pipelines/stages in your GHL account match the stage IDs already stored as secrets (they were configured earlier; if any moved, we update the secret).
- Nothing to set up on the GHL side for the cron — it's all database-side.
