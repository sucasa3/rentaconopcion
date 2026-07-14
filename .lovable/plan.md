## Confirmed decisions
- **Distribution**: Round-robin per (category, zip)
- **SLA**: 25 minutes to accept, then auto-reassign to next in queue
- **GHL push**: only after a pro claims (not on lead creation)
- **Pricing**: $297/mo for founding partners 1–3, $397/mo after

## Architecture: two databases, clear split

**Lovable Cloud (system of record)**
- All lead lifecycle: creation, offers, claims, SLA timers, reassignment log
- Round-robin cursor state per (category, zip)
- Pro roster, coverage, founding-partner flag

**GHL (CRM + comms)**
- Homeowner contact records + lifecycle pipeline (already built)
- Service Leads pipeline — opportunity created **only when claimed**, then advances through Claimed → Contacted → Scheduled → Completed
- SMS/email to pros for offers (via GHL messaging API called from our server)

---

## Build plan

### 1. Database (migration)
New tables:
- `pro_coverage` — pro_id, category, zip (composite unique). Which pros serve which areas.
- `lead_offers` — service_request_id, pro_id, offered_at, expires_at (offered_at + 25min), status (`pending|accepted|declined|expired|cancelled`), position in rotation. One row per (request, pro).
- `lead_assignments` — service_request_id (unique), pro_id, claimed_at, ghl_opportunity_id. The winning claim.
- `rr_cursor` — category, zip, last_pro_id, updated_at. Round-robin pointer.

Extend `pros`: `is_founding_partner boolean`, `monthly_price_cents int`, `accepting_leads boolean`.
Extend `service_requests`: `routing_status` (`unrouted|offered|claimed|completed|cancelled`), `zip`.

Enum `app_role`: add `pro` if missing.
GRANTs + RLS for every new table (pros see only their offers; admin sees all; homeowners see only their own request's assignment).

Trigger: on `service_requests` insert (source='homeowner' or 'app'), enqueue routing job.

### 2. Server functions (`src/lib/leads.functions.ts`)
- `offerNextPro({ requestId })` — admin/system. Picks next pro via round-robin, inserts `lead_offers` row, sends SMS/email via GHL, sets `service_requests.routing_status='offered'`.
- `claimLead({ offerId })` — pro-auth. Atomic: mark offer accepted, insert `lead_assignments`, expire sibling offers, create GHL opportunity in Service Leads pipeline (Claimed stage), return homeowner contact info.
- `declineLead({ offerId })` — pro-auth. Mark declined, immediately offer to next pro.
- `expireStaleOffers()` — cron. Any `pending` past `expires_at` → mark expired, offer next pro. Runs every 5 min via existing `pg_cron` pattern hitting `/api/public/leads/tick`.
- `listMyOffers()` / `listMyClaims()` — pro dashboard queries.
- `adminForceReassign({ requestId })` — admin override.

### 3. GHL integration additions (`src/lib/ghl.server.ts`)
- `createServiceLeadOpportunity(contactId, requestSummary, stageId)` — Service Leads pipeline.
- `advanceServiceLead(oppId, stage)` — Claimed / Contacted / Scheduled / Completed.
- `sendPro Sms(proPhone, msg)` — via GHL conversations API.
- New env vars needed: `GHL_SERVICE_LEADS_PIPELINE_ID`, `GHL_LEAD_STAGE_CLAIMED_ID`, `..._CONTACTED_ID`, `..._SCHEDULED_ID`, `..._COMPLETED_ID`. Will request via `add_secret` after infrastructure is built.

### 4. Cron
Public route `src/routes/api/public/leads/tick.ts` — HMAC-verified, calls `expireStaleOffers()`. Schedule via `pg_cron` every 5 min.

### 5. UI
- **`/pro` dashboard**: replace mock with real data — Active offers (countdown to expiry), Claim/Decline buttons, My claims, SLA stats. Founding Partner badge if applicable.
- **`/admin`**: Leads panel — unrouted, in-flight offers with timers, reassignment history, force-reassign button.
- **`/partner` and `/pro` marketing pages**: update pricing block to "$297/mo for first 3 founding partners (2 remaining) — then $397/mo".
- **Homeowner request confirmation**: show "Matching you with a pro — usually under 25 minutes" until claim, then reveal pro contact.

### 6. Order of execution
1. Migration (schema + RLS + GRANTs + trigger + enum)
2. `ghl.server.ts` additions
3. `leads.functions.ts` + tick route
4. Cron job SQL (after user gives me the GHL pipeline/stage IDs via `add_secret`)
5. Pro dashboard UI
6. Admin leads panel
7. Pricing copy updates on `/partner` and `/pro`
8. Homeowner request confirmation state

---

## What I need from you after the migration
The GHL Service Leads pipeline + stage IDs (Claimed, Contacted, Scheduled, Completed). I'll prompt for them via secret storage when we hit that step. Everything else I can build now.

Approve and I'll start with the migration.