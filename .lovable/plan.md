# Activate the GHL connection

Goal: make contacts, pros, and claimed leads flow into GoHighLevel automatically, on a schedule, without duplicate API calls.

## 1. Put the sync on a schedule

The sync endpoint currently requires a hand-signed security header, which the database scheduler can't produce. Switch it to the exact same key-header check the existing lead-routing job already uses, then schedule it.

- Update `src/routes/api/public/ghl.drain.ts` to authenticate with the `apikey` header compared against `SUPABASE_PUBLISHABLE_KEY` (mirrors `src/routes/api/public/leads.tick.ts`); drop the HMAC check.
- Schedule a pg_cron job `sucasa-ghl-drain` every 2 minutes calling `https://project--94429f0c-1687-4b34-81a7-6195279589c3.lovable.app/api/public/ghl/drain` with the `apikey` header and an empty body — same shape as `sucasa-leads-tick`.

## 2. Sync pros and claimed leads, not just homeowners

Today the drain only picks up `entity_type = 'homeowner'`, so the queued pro and service-request jobs sit forever.

- Rework `drainGhlQueue` in `src/lib/ghl.functions.ts` to select all pending job types (no `entity_type` filter) and branch per type:
  - `homeowner` — existing behavior (contact upsert + lifecycle stage move).
  - `pro` — upsert the pro as a GHL contact (business name, email, phone, category, metro, plan, language, membership status); record `ghl_contact_id` on the pro and in `ghl_sync_state`.
  - `service_request` / `claim` — only create the service-lead opportunity once a pro has claimed it (per the agreed model); otherwise mark the job processed as a no-op so it doesn't retry forever.
- Keep the existing per-job retry/`attempts` and `last_error` handling for every branch.

## 3. Stop duplicate calls

42 queued jobs cover only 17 distinct homeowners, because every insert and update enqueues a new row.

- Change the enqueue helper so a pending job for the same entity is reused instead of duplicated (upsert on entity type + entity id while `processed_at` is null).
- Collapse the existing pending duplicates so the first drain run doesn't burn redundant GHL calls.

## 4. Verify

- Trigger one drain manually from the admin panel, then confirm sync records exist for homeowners, the pro, and any claimed lead, and that the queue drains to zero with no errors.

## Technical notes

- Endpoint stays under `/api/public/*` so the published site doesn't gate it; the anon key check is the project's established cron auth pattern.
- Enqueue de-dup requires a partial unique index on pending queue rows (schema migration).
- Batch size stays at 25 per run; at 2-minute intervals that clears the current 44-job backlog within minutes.
