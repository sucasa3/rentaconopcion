# 100X Mortgage Branch Demo — staging plan (preview only, no publish)

## Audit findings (read-only)

- **Lender org:** SuCasa Demo Lender (`1111…1111`). Members: lender.manager@sucasatest.com (owner), lender.mlo@sucasatest.com (member), plus Neil's own login (owner).
- **Hero MLO:** lender.mlo@sucasatest.com. Assigned book "Client Roster · 76 Homeowners" (76 active).
- **Other books in the same org:** "Demo Book · 250 Clients" (manager, fake addresses — will NOT be enriched), "Manuel Test" (Neil's login, 661 clients).
- **Agent orgs:** SuCasa Demo Realty (agent.manager / agent.officer, 101-client book) — **not connected** to the demo lender. SuCasa Agent Team (info@sucasa.com, empty book) — the only connected agent. Three other connections are "invited" with no agent attached.
- **Introductions:** no staged lifecycle examples exist yet.
- **1010 Arbor Creek Dr:** two cached ATTOM records from August, **no value estimate**, never looked up with BatchData. No home profile is attached to any user. Per your answer, no paid lookup.
- **545 Huntwick Place, Roswell:** cached ATTOM value $744,126 (range $697k–$791k, confidence 94), mortgage, tax, sales and detail records all present. **Selected as the hero MLO's My Home** — complete, local, no new provider call.
- **BatchData:** zero properties enriched so far. No paid request is needed for this demo.
- **Opportunities already computed:** demo lender org has large equity / refinance-review / HELOC / move-up counts but only 9 mortgage-review rows; Demo Realty has 42 equity, 40 refinance-review, 28 HELOC.
- **Shared database:** preview and sucasa.com use the same data. All staging stays inside test accounts and demo-named orgs (approved).

## What gets staged (data only, no code or design changes)

1. **Hero MLO My Home** — create lender.mlo's home profile at 545 Huntwick Place from the existing cached ATTOM record. Nothing is labeled as BatchData; no provider request.
2. **New demo book** — create "Branch Demo · Hero MLO", assigned to lender.mlo, with about 15–25 demo relationships on existing cached enriched properties, fictitious names/emails, marked as past clients so they pass the lender-access check. **The 76-client Client Roster is not touched.** To keep Today and My Book focused on the demo book, the 76-client book is reassigned away from lender.mlo (assignment only — its rows, owners and history are unchanged), and restored afterwards by the cleanup script. If you prefer it stays assigned, the demo book will still rank at the top via its engagement signals.
3. **Neil Terc call client** — one record in the demo book: "Neil Terc", 678-485-3054, on a cached enriched property with a strong equity reason and a recent engagement signal so it ranks near the top. No messages sent.
4. **Three demo agents** — logins isabella.demo@, marcus.demo@, priya.demo@sucasatest.com, each with their own agent org and book (Isabella about 34 homeowners; others about 22 and 48). Connected to SuCasa Demo Lender at the lender-org level, as the product works today.
5. **Opportunities** — produced only by the existing signal engine. No hand-written counts. Whatever truthful counts result are reported; a category is shown to the lender as an exact number only if it has at least 5.
6. **Introductions** — three demo examples with Isabella: A requested, B offered to a chosen client, C accepted (only granted contact channels shown). No real email or SMS.
7. **Branch view** — the manager's existing team roster; totals reported for verbal use.

## Logins

Each account needed tomorrow (lender.mlo, lender.manager, isabella.demo, marcus.demo, priya.demo) is created or confirmed with a verified email and a password set directly, then a real sign-in is tested in the browser — no email delivery needed. Passwords are never shown in the report. If any account can't be signed into this way, I stop and give you the exact secure setup step.

## Cleanup (strictly scoped)

- Every row created by staging is recorded by id in a demo manifest.
- Cleanup first runs a dry run listing the number and type of rows it would delete, and only deletes ids in the manifest.
- It never deletes cached property intelligence, pre-existing records, or anything not created by this staging. It restores the 76-client book's original assignment.

## Verification (preview)

Walk A–H in the browser as lender.mlo, lender.manager and Isabella, English and Spanish (language restored afterwards). One real post-call note on Neil Terc via typed fallback, confirmed to resurface. Discovery checked without uploading.

## Technical details

- Data written with direct inserts (no migrations, no code or design changes).
- No ATTOM calls, no BatchData calls, no enrichment of the 250-client fake book, no changes to real homeowner records.

## Final report

Everything in section 17 of your request, the actual opportunity counts, login status, and the cleanup dry-run summary. Then stop for approval. Nothing is published.
