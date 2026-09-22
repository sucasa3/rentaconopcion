# Close the privacy compliance gaps (revised)

Four gaps make an accurate privacy policy impossible today: users cannot delete their account, cannot export their data, nothing is purged on a schedule, and there is no working way to opt out of email or SMS. Four stages, each reviewed and published separately. Nothing about permissions, consent gating, relationships, ranking, opportunity logic, Today screens or View homeowner behavior changes.

A principle runs through all of it: **data SuCasa controls** is separated everywhere from **independent business records an agent or lender organization maintains**. The two are never mixed in an export, a deletion, or a policy statement.

---

## Stage 1 — Account page, and a personal privacy export

No account or settings screen exists today, so one gets created first; the later stages live inside it.

**New "Account" page**, from the existing account menu:
- **Your account** — name, email, phone, language. Changing email or phone requires verification: the new address or number receives a code that must be entered before the change takes effect, and the old one is notified.
- **Your home** — the property address lives here, not in account settings, and is presented as a property change (it re-derives the entire Home Profile, valuation and equity picture). Changing it requires an explicit confirmation step.
- **Communication preferences** — Stage 3.
- **Download your data** — personal privacy export.
- **Delete your account** — Stage 2.

**The privacy export is strictly personal.** It contains the signed-in person's own information and what SuCasa holds about them: profile, roles, home profile, home plan, inspection findings, service log, service requests, document index with time-limited download links, activity history, selling-intent submissions, inferred intents, consents granted and revoked, introduction history, communication preferences and their history, premium membership.

It does **not** include client records an agent or lender holds about other people, even though that user can see them in the workspace — those are third-party personal data held by the organization, not the requester's own. A workspace/business export, if wanted later, is a separate organization feature governed by workspace permissions and is out of scope here.

Each export is recorded in the compliance audit log.

## Stage 2 — Account deletion

**In the product:** a delete button behind typed confirmation, with a plain-language screen stating exactly what is removed, what is retained, and why.

**Deleted:** the login, profile, roles, uploaded documents (rows *and* the underlying files, which cascade does not reach today), home profile, plan, inspection findings, service log, service requests, activity history, selling-intent submissions, inferred intents, assistant conversations and stored "home memory", alerts, consent grants.

**Retained, and stated on the confirmation screen:**
- A client record an agent or lender independently holds in their own book is that organization's business record and stays — but it is unlinked from the deleted account, all intelligence access is revoked, and it is marked do-not-contact.
- The minimum evidence needed to prove consent, revocation, deletion and opt-out actually happened: who, when, scope, source. Not the underlying personal content.

**A central suppression record** prevents a deleted person from being silently recreated, re-matched or contacted when an organization reimports the same list. It stores only what suppression needs — one-way hashes of email, phone and normalized address, plus the event type and timestamp. No names, no readable contact details, no reversible copy. Import, matching and outreach paths check it before creating a link or sending anything, and a suppressed match is reported back to the importer as suppressed without revealing why or who.

**Organization owners always have a path to deletion** — never a dead end. An owner of the last organization chooses either to transfer ownership to another member, or to close the organization: its client records are handled per the organization's own retention obligations (retained for the configured documentation-retention period, access revoked and marked closed, then purged), after which personal deletion completes. Deletion is deferred, never refused.

Every deletion is audit-logged before the account disappears.

## Stage 3 — Working preferences for email, SMS and calls

Today the do-not-email / do-not-text / do-not-call flags are honored when sending but nothing can ever set them. Most urgent gap.

**Purpose classification, not workflow naming.** Every message is classified by what it is *for*:
- **Transactional** — sign-in links, password resets, verification codes, receipts, updates on a service request the person asked for. Not suppressible by a marketing opt-out.
- **Relationship development** — introduction invitations and similar outreach that develops a commercial relationship. Treated as **marketing**, fully suppressible, never classified as transactional.
- **Marketing** — campaigns and promotional outreach.

Each send path is tagged with its purpose and the suppression check is driven by that tag.

**Mechanisms:**
- Unsubscribe link in the footer of every marketing and relationship-development email — one click, no login, using the existing signed-token mechanism; confirmation page with undo.
- A preference page behind the same link for turning email, SMS and calls off individually.
- Inbound SMS: a provider webhook honoring STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT, and START/UNSTOP to re-enable. **The exact keyword set, payload shape and signature verification are validated against the live SMS provider before this is built** — the provider may already handle keywords itself, in which case the work is to ingest its opt-out state rather than parse messages.
- Preferences visible and editable in the account page.

**Consent evidence.** Every change records source, timestamp, scope and channel. Turning SMS back on in settings records an account-holder-initiated preference change — it does **not** by itself manufacture whatever express written consent a given marketing channel may require. Re-enabling a channel that needs express consent presents a distinct consent step whose exact wording, timestamp and IP are stored as evidence.

**Suppression survives deletion** via the Stage 2 suppression record, so a prior opt-out is still honored after the account is gone.

## Stage 4 — Retention, with overrides, monitoring and broad redaction

**Nightly purge**, but only where nothing overrides it:

| Data | Kept for |
|---|---|
| Property-data and AI usage call logs | 90 days |
| Email open/click events | 13 months |
| Homeowner activity history | 24 months |
| Failed-lookup suppression records | 12 months |
| CRM sync queue (completed) | 30 days |
| Security and authentication logs | 12 months |
| Billing and payment records | 7 years (tax/accounting) |
| Consent, opt-out, deletion and compliance evidence | 5 years (existing configured baseline) |
| Suppression records | Indefinite (that is their purpose) |

**Overriding holds.** A legal hold, dispute, or open fraud/security investigation marks the affected records and the purge skips them until the hold is released. Backups are excluded from live purging and are governed by their own rotation window, which is documented rather than silently assumed — the policy must state that deleted data persists in backups until they age out.

**Monitoring.** Every purge run logs start, end, rows removed per category, records skipped for holds, and success or failure. A failed or missed run raises a visible admin signal rather than failing quietly.

**Redaction, broader than addresses.** An audit of every application and provider error/log write path, then redaction before storage of: names, email addresses, phone numbers, property addresses, IP addresses, authentication tokens and API keys, and document contents. Error text is reduced to a status and short reason code. Existing stored error text is cleared in the same change.

---

## Technical notes

- Account page under the authenticated layout; export and deletion as authenticated server functions. Email/phone verification via a short-lived signed code; property change goes through the existing Home Profile refresh path.
- Export runs as the signed-in user so row-level security bounds it; document links use short-lived signed URLs from the existing private buckets. Organization-owned client tables are explicitly excluded from the query set.
- Deletion runs privileged, verifies the caller owns the account, deletes storage objects under the user's folder first, writes the suppression record and audit entry, then removes the auth user. Existing cascades cover profile/roles/documents/activity/consents; `lender_portfolio_clients.homeowner_id` already sets null rather than deleting.
- New tables: a suppression register (hashed identifiers, event type, timestamp, scope), a message-purpose/consent-event log, a retention-hold register, and a purge-run log. Suppression hashing uses a server-held secret so hashes are not externally reversible.
- Purpose tags added to every send path (`outreach.server.ts`, `campaigns-run.server.ts`, `introductions.server.ts`, `daily_read.server.ts`, `send-email.ts`, `leads.server.ts`).
- Unsubscribe and inbound-SMS endpoints as public API routes under `src/routes/api/public/`, each verifying its caller — HMAC token for unsubscribe (reusing `tracking.server.ts`), provider signature for the webhook.
- Retention as SQL functions plus a `pg_cron` nightly schedule alongside the two existing jobs.
- Redaction work in `attom.server.ts`, `batchdata.server.ts`, `enrichment.server.ts`, `valuation.server.ts`, `ghl.functions.ts`, `ai-usage.server.ts`.
- Each stage: typecheck, full suite, new tests for export scope, deletion cascade and suppression, purpose-based suppression, unsubscribe tokens, retention windows and holds — plus authenticated smoke tests before anything is published.

## External verification, documented before the policy is drafted

A written record to be produced alongside this work, since none of it is answerable from code:
- **AI provider(s)** — exact provider and models behind the gateway, whether API inputs and uploaded documents are retained, for how long, whether inputs are used for model training, and the applicable data-processing terms. Whole inspection reports are sent to the model, so this is the highest-priority item.
- **Hosting, CDN and infrastructure** — which providers, what IP/device/request data they log, and their retention periods, including backup rotation.
- **Analytics, monitoring and error reporting** — any provider that independently receives personal information, including the platform's error-capture hook and the email provider's own tracking.
- **Other processors** — property data, CRM, payments, email: retention and sub-processor terms for each.
