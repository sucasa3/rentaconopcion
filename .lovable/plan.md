# Lender go-live: what's left

Current state, verified just now:

| Item | Status |
|---|---|
| Campaigns activated | 12 active — done |
| Homeowner records in books | 1,063 (all have emails); 50 are placeholder "Address on file" |
| Property data matched | 542 of 1,063 clients have enriched property records; 419 have a value estimate |
| Opportunities detected | 2,217 — the signal engine is working |
| Enrichment queue | Empty (nothing stuck) |
| Emails ever sent | 0 |
| Email sender domain `notify.sucasa.com` | **Pending** — DNS not complete |
| Sender identity | Org fallback only ("SuCasa Demo Lender"); **0 loan officers have a personal identity saved** |
| Book ownership | 1 book has no assigned loan officer |

## Remaining blockers

### 1. Finish DNS for notify.sucasa.com (blocking, external)
Nothing can send until this verifies. At the registrar for sucasa.com add:
- TXT `_lovable-email.sucasa.com` → the verification value shown in Project Settings → Email
- NS `notify.sucasa.com` → `ns3.lovable.cloud` and `ns4.lovable.cloud`

### 2. Replace demo sender identity with the real one
The only lender org is still "SuCasa Demo Lender" with a demo reply-to. Before a live send:
- Rename the org and set real team defaults (sender name, reply-to, contact, phone, license, sign-off, logo)
- Each MLO fills in their personal "My email identity" card so mail comes from the officer, not the brand
- Assign the unassigned book to its loan officer so per-MLO identity resolves

### 3. GHL workflows and templates (external)
The engine pushes contacts and applies the 12 campaign tags; GHL must have a matching workflow + branded email template per tag, plus the custom fields (`sc_value`, `sc_equity`, `sc_campaign_body`, `sucasa_user_id`, `sucasa_language`). Nothing has sent yet, so this is unverified.

### 4. Dry-run, then first real batch
- Send one campaign to an address you control; check from-name, reply-to, unsubscribe, and that the GHL contact/opportunity appears
- Then open the send to the ~542 clients with matched property data

## Coverage note (not a blocker)
521 addresses had no property-record match and are suppressed from retries; 50 are literal placeholders. Campaigns needing value/equity will skip those homeowners. Optional follow-up after launch: a cleanup pass that re-verifies suppressed addresses and lets MLOs correct bad ones inline.

## What I'd do in the app
Only two items are code/data work on my side: setting the real org branding + assigning the unassigned book (data), and the post-launch address-cleanup pass (feature). Items 1, 3 and the dry-run approval are yours.
