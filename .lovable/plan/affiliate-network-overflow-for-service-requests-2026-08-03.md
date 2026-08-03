# Affiliate Network Overflow for Service Requests

Keep the existing SuCasa pro round-robin as the primary path, and add a single "partner network" fallback so no lead ever dies unrouted.

## Routing rules (final)

```text
New service request
   |
   |-- Any active pro covering (category, metro/zip)?
   |        YES -> round-robin offer, 25-min SLA, cascade to next pro
   |                    |-- claimed  -> normal SuCasa flow + GHL opportunity
   |                    |-- rotation exhausted / all expired -> partner handoff
   |        NO  -> immediate partner handoff
```

Handoff is a POST to the partner's endpoint with our lead payload. Homeowner sees nothing different — status stays "Matching a pro", then "Pro assigned" once the partner (or a SuCasa pro) takes it.

## What gets built

1. **Partner config** — one new table `lead_partners` (name, endpoint URL, secret name, categories covered, states/metros covered, active, payout notes). Admin-managed, so you can add a second network later without code changes.
2. **Handoff engine** — a server-side `handoffToPartner(requestId)` in the routing module. Picks the first active partner matching the category/area, POSTs the lead JSON, records the response.
3. **Handoff log** — new table `lead_handoffs` (request, partner, status, partner lead id, http status, error, payload snapshot, timestamps) so every send is auditable and retryable.
4. **Wire into routing** — in `offerNextPro`, the two dead-ends (`no_eligible_pros`, `exhausted_rotation`) call the handoff instead of just marking `unrouted`. New `routing_status` value: `partner_sent` (plus `partner_failed` for retry by the existing cron tick).
5. **Admin visibility** — a Partner Network panel in the admin dashboard: list of partners with an active toggle, recent handoffs with status, and a manual "Send to partner" / "Retry" button for any unrouted request.
6. **GHL** — handoff enqueues a sync so the request appears in GHL tagged `partner_handoff` with the partner name, keeping your CRM the single source of truth.
7. **Secret** — the partner's API key stored securely once you have it; the code reads it at call time.

## Payload we send

Category, description, timeline, budget range, homeowner first name, phone, email, service address (line/city/state/zip), our request id, and source `sucasa`. Configurable field-name mapping is out of scope for the MVP — we'll match their spec once you share their API doc.

## Technical notes

- New tables follow the existing pattern: GRANTs, RLS enabled, admin-only read/write via `has_role(auth.uid(),'admin')`; server code uses the service-role client.
- Handoff runs inside the existing `sucasa-leads-tick` cron path, so retries of `partner_failed` happen automatically without a new scheduler.
- Outbound call is a plain `fetch` with a 10s timeout, HMAC or bearer auth depending on what the partner requires.

## What I need from you before wiring the live send

The partner's API doc: endpoint URL, auth method, required field names, and their response shape. Until then I'll build against a configurable generic JSON payload and leave the partner row inactive, so nothing sends by accident.
