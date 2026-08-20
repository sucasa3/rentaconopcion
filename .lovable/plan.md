# Finish the lender side: test-ready, then go live

Verified state right now:

| Item | Status |
|---|---|
| Clients in books | 1,063 — all have an email |
| Property records matched | 479 enriched; enrichment queue empty |
| Opportunities detected | 2,217 |
| Campaigns active | 12 |
| Campaign sends attempted | 18 — **all failed** |
| Failure reason | GHL `POST /contacts/upsert` → 401 "The token is not authorized for this scope" |
| Email sender domain | `sucasa.com` — still `initiated`, DNS not verified |
| MLO personal identities saved | 0 |
| Lender org branding | Demo values ("SuCasa Demo Lender", `lender-demo@sucasa.com`) |
| Agent org branding | Empty |
| Unassigned books | 0 — all books have an owner |

Nothing in this plan sends email to a real client. Any live batch stays behind a separate explicit approval.

## What I'll build/fix in the app

### 1. Make the send path testable without GHL
Today a GHL 401 kills the whole send, so we can't test copy, identity or delivery. I'll split the pipeline so email delivery and CRM sync are independent:
- CRM push failure is recorded on the send row but no longer marks the send failed
- Send statuses become explicit: `queued`, `emailed`, `crm_failed`, `failed`
- Retry action for CRM-only failures once the token is fixed

### 2. Admin "Go-live readiness" panel
One screen in the admin area that shows, live: DNS/email-domain status, GHL token check, org branding completeness, MLO identity coverage, enrichment coverage, and the last 20 send attempts with their error. This is what we watch during testing instead of me querying the database each time.

### 3. Test-send console (safe)
An admin/MLO control to send a single campaign to an address you type in, using a real client's data. Guardrails: allow-listed recipient only, marked as a test in the send log, never touches the client's own inbox, never counts against frequency caps.

### 4. Branding cleanup
- Replace the demo lender org's sender name / reply-to / contact / signoff with real values via a form (no code deploy)
- Prompt every MLO to complete their personal identity card, and show coverage in the readiness panel
- Fill the agent org's branding fields so agent-side campaigns don't fall back to a bare org name

### 5. Send guardrails before any live batch
- Hard block on sending when the email domain isn't verified
- Per-homeowner frequency cap enforced at send time
- Unsubscribe / consent check re-verified in the send path
- Batch size cap plus a manual "open the send" switch, so the first live run is intentional

## What's on your side (external, blocking)

1. **DNS for the sender domain** — add the TXT verification record and the NS delegation shown in Project Settings → Email. Nothing sends until this reads verified.
2. **GHL token scope** — the current private integration token lacks contact write scope. Regenerate it in the new GHL location with `contacts.write`, `contacts.readonly`, `opportunities.write`, and give it to me to swap in.
3. **GHL workflows + templates** — one workflow and branded email template per campaign tag, plus custom fields `sc_value`, `sc_equity`, `sc_campaign_body`, `sucasa_user_id`, `sucasa_language`.
4. **Real lender branding values** — sender name, reply-to, phone, license, sign-off, logo.

## Sequence

1. Pipeline split + statuses + readiness panel + test console (my work — can start now)
2. You: DNS records and new GHL token
3. Test send to an address you control; verify from-name, reply-to, unsubscribe, and the GHL contact/opportunity
4. Small batch (25 clients) with matched property data
5. Open to the ~479 enriched clients

## Technical notes
- Changes concentrate in `src/lib/campaigns-run.server.ts` (status handling, delivery/CRM split), `src/lib/ghl.server.ts` (scope-aware error surfacing), `src/lib/campaigns.functions.ts` (test-send + readiness reads), plus a new admin panel component.
- `campaign_sends` gains `crm_status`, `crm_error`, `is_test` columns with GRANTs and admin/org-scoped RLS matching the existing policies.
- Coverage note (not a blocker): ~584 addresses have no property-record match; value/equity campaigns skip those homeowners.
