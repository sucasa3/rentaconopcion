# Go-live readiness: not yet — 4 blockers

Verified just now against the live backend.

| Check | State |
|---|---|
| Campaigns active | 12 — ready |
| Homeowners in books | 1,063 |
| Property records enriched | 479; enrichment queue empty (nothing stuck) |
| Opportunities detected | 2,217 — engine working |
| Emails actually sent | 0 (18 sends still `queued`) |
| Email sender domain | `sucasa.com` status **initiated** — not verified |
| GHL CRM push | **Failing** — all 18 sends: `401 token is not authorized for this scope` |
| MLO sender identities | **0 saved** |
| Lender org branding | Still "SuCasa Demo Lender" / `lender-demo@sucasa.com` |

## Blocker 1 — Email domain not verified (external, yours)
Nothing can send until DNS completes. Add at the registrar the TXT verification record and the `ns3.lovable.cloud` / `ns4.lovable.cloud` NS records shown in the email setup dialog, then re-check status.

## Blocker 2 — GHL token still missing scopes (external, yours)
The only recorded CRM failure is the same 401 on `/contacts/upsert`. Regenerate the private integration token in the new location with at least `contacts.readonly`, `contacts.write`, `opportunities.readonly`, `opportunities.write`, `locations.readonly`. Paste it and I'll swap it in and re-run the GHL Connection Doctor until every probe passes.

## Blocker 3 — Real sender identity (small work on my side)
- Rename the lender org and set real sender name, reply-to, phone, license, sign-off, logo.
- Each MLO fills in their "My email identity" card (0 exist today), so mail comes from the officer, not the demo brand.

## Blocker 4 — Dry-run before the first batch
Once 1–3 are green: send one campaign to an address you control, confirm from-name, reply-to, unsubscribe, and that the GHL contact + opportunity appear. Then requeue the 18 stuck sends and open the batch to the enriched book.

## What I'd do next in the app
Only Blocker 3 is code/data work I can do now (org branding fields + prompting MLOs for identity, plus a "retry CRM push" action for the 18 stuck sends). Blockers 1 and 2 are DNS and GHL actions on your side; approving this plan sends no email.
