# Go-live testing plan (lender service)

A staged test pass: verify each layer works before opening sends to the full book. Nothing here sends bulk email until stage 5.

## Stage 0 — Confirm baseline (5 min, me)

Re-verify the things that were green earlier today, since they can drift:

- GHL Connection Doctor on the admin page: token, location, pipeline/stages, custom fields, tags.
- Email domain `notify.sucasa.com` still verified.
- Campaign send queue: no rows stuck in `failed` email or CRM status.
- Active campaign count and the size of the eligible audience.

Output: a pass/fail table posted back to you.

## Stage 1 — Sender identity (you)

For each account you'll test with:

- Lender org: name, sender name, reply-to, logo, contact name/title/phone, license, sign-off.
- Each MLO: personal "My email identity" card filled in.
- Every book has an assigned loan officer.

Test: open the campaign preview for one client under an MLO login and confirm the preview shows the officer's identity, not the org fallback.

## Stage 2 — Account and permission tests (you + me)

Log in as each role and confirm the first screen and the guardrails:

| Role | Check |
|---|---|
| MLO | Lands on their book; sees only their assigned clients |
| Branch manager | Sees all MLO books, can reassign |
| Agent | Sees only sponsored/credited clients |
| Homeowner | Sees own home only; no lender data leaks |
| Admin | Doctor + dry-run panels visible |

Also: sign out, password reset, and a fresh signup through onboarding in both English and Spanish.

## Stage 3 — Data correctness spot-check (me, you confirm)

Pick 10 real clients spanning enriched / partially enriched / unmatched address:

- Value, equity, and cash-out numbers match the property record.
- Permitted work and permit counts look sane.
- Opportunity/signal reasons are explainable in plain language.
- Unmatched addresses degrade gracefully (no blank or zero-value cards).

Anything wrong here is a blocker — it's what the email copy is built from.

## Stage 4 — Controlled email tests (me, you check inboxes)

Using the admin dry-run panel, send to addresses you control:

1. One send per campaign type that's active (12 today) — check subject, body, CTA link, branding, from-name, reply-to, unsubscribe.
2. One send as an MLO identity and one as the org fallback — confirm they differ.
3. One Spanish-language recipient.
4. Render check across Gmail web, Gmail iOS, Apple Mail, and Outlook.
5. Reply to one email and confirm it reaches the reply-to inbox.
6. Confirm each test lands in GHL: contact, custom fields (`sc_value`, `sc_equity`, `sc_campaign_body`, `sc_cta_url`), campaign tag, and opportunity.

Blockers: broken links, missing unsubscribe, wrong sender, spam placement.

## Stage 5 — Small live batch (joint decision)

- Enable sends for one book only, capped at ~25 clients with enriched data.
- Watch for 24h: delivery, bounces, complaints, opens/clicks if available, CRM push errors, and any homeowner replies.
- Then a second batch of ~100 before opening the full audience.

Stop rule: any bounce rate over ~3%, any complaint, or any CRM push failure pauses the rollout.

## Stage 6 — Ongoing monitoring

- Daily: send log, CRM error queue, enrichment queue depth.
- Weekly: campaign performance by type, unsubscribe rate, task queue completion by MLO.

## What I need from you

- Confirm the test inboxes to use (beyond Neil@SuCasa.com), ideally one Gmail, one Outlook.
- Which book/MLO should be the first live batch.
- Whether the ~50 placeholder "Address on file" records should be excluded from all sends (recommended).
