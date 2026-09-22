# Close the privacy compliance gaps

The audit found four gaps that make an accurate privacy policy impossible today: users cannot delete their account, cannot export their data, nothing is ever retained-and-purged on a schedule, and there is no working way to opt out of email or SMS. This plan closes all four, in four stages that can each be reviewed and published separately.

Nothing about permissions, consent gating, relationships, ranking, opportunity logic, Today screens, or View homeowner behavior changes.

---

## Stage 1 — An account page, and data export

There is no account or settings screen anywhere in the product today, so one gets created first; the next three stages all live inside it.

**New "Account" page**, reachable from the existing account menu, with four sections:
- **Your details** — edit name, email, phone, address, language. Today these can only be changed by walking back through onboarding.
- **Communication preferences** — see and change email/SMS/call preferences (wired up in Stage 3).
- **Download your data** — one button.
- **Delete your account** — (wired up in Stage 2).

**Download your data** produces a single JSON file covering everything tied to the signed-in person: profile, roles, home profile, home plan and plan items, inspection findings, service log, service requests, documents (filename, type, date, plus a time-limited download link for each), activity history, selling-intent submissions, inferred intents, consents granted and revoked, introduction history, premium membership, and — for agents and lenders — their organization membership, portfolios and client records.

The export is assembled server-side as the signed-in user, so it can only ever contain what that person is entitled to see. Each export is recorded in the existing compliance audit log.

## Stage 2 — Account deletion

**In the product:** a delete button behind a typed confirmation, with a plain-language screen explaining exactly what is removed and what is not.

**What gets deleted:** the login itself, the profile, roles, uploaded documents (both the database rows *and* the underlying files, which today would be orphaned), home profile, plan, inspection findings, service log, service requests, activity history, selling-intent submissions, inferred intents, assistant conversations and stored "home memory", alerts, and consent grants.

**What is deliberately kept, and must be said plainly on the confirmation screen:** a record an agent or lender independently holds about that person in their own client book is *their* business record, and stays — but it is unlinked from the deleted account, all intelligence access on it is revoked, and it is flagged do-not-contact so the deletion cannot be undone by re-matching. Compliance and audit entries are also retained, as records of consent decisions that must outlive the account.

For an agent or lender who is the last remaining owner of an organization, deletion is blocked with a clear message to transfer ownership or contact support first — silently orphaning a book of client records would be worse than refusing.

Every deletion is recorded in the audit log (who, when, what was removed) before the account disappears.

## Stage 3 — Working opt-out for email and SMS

Today the do-not-email / do-not-text / do-not-call flags are honored when sending, but nothing in the product can ever set them. That is the most urgent gap.

- **Unsubscribe link in every marketing and campaign email** — footer link, one click, no login required, using the same signed-token mechanism the product already uses for open and click tracking. Clicking it sets do-not-email for that record and the account-level campaign opt-out, then shows a confirmation page with an "undo" option.
- **A preference page** at the same link where someone can turn email, SMS and calls off individually rather than all at once.
- **Inbound SMS "STOP"** — a webhook endpoint that receives inbound messages from the SMS provider, matches the sending phone number, and sets do-not-text. Replies of STOP, STOPALL, UNSUBSCRIBE, CANCEL, END and QUIT are honored; START and UNSTOP re-enable.
- **Preferences visible and editable** in the Stage 1 account page for signed-in users.
- Transactional email (sign-in links, password resets, service-request updates, introduction invitations) is **not** suppressed by a marketing unsubscribe — it is still gated by the existing consent rules.

Every preference change writes its source and timestamp to the existing consent columns, so the record shows how each opt-out arrived.

## Stage 4 — Retention limits, and cleaning addresses out of error logs

**Scheduled nightly purge** with these windows, chosen to keep operational value while bounding exposure:

| Data | Kept for |
|---|---|
| Property-data and AI usage call logs | 90 days |
| Email open/click events | 13 months |
| Homeowner activity history | 24 months |
| Failed-lookup suppression records | 12 months |
| CRM sync queue (completed jobs) | 30 days |
| Compliance and consent audit records | 5 years (the retention baseline already configured in the product) |

**Stop storing addresses in error text.** When a property lookup fails, the provider's raw error text is stored verbatim today and can contain the street address. Error text will be reduced to a status and a short reason code before it is saved, and existing stored error text will be cleared in the same change.

---

## Technical notes

- Account page as a new route under the authenticated layout; export and deletion as authenticated server functions.
- Export runs as the signed-in user so row-level security bounds the result; document links use short-lived signed URLs from the existing private buckets.
- Deletion runs in a privileged server function that verifies the caller is deleting their own account, deletes storage objects under the user's folder first (cascade does not reach storage), then removes the auth user. Existing cascade rules already handle profile, roles, documents, activity and consent rows; `lender_portfolio_clients.homeowner_id` already sets null rather than deleting, which is the retained-business-record behavior above. A migration adds columns to mark those rows revoked and do-not-contact on deletion.
- Unsubscribe and inbound-SMS endpoints as public API routes under `src/routes/api/public/`, each verifying its caller: the unsubscribe link by HMAC token (reusing `src/lib/tracking.server.ts`), the SMS webhook by provider signature.
- Retention as a SQL function plus a `pg_cron` nightly schedule, alongside the two existing scheduled jobs.
- Error-text change in `src/lib/attom.server.ts`, `batchdata.server.ts`, `enrichment.server.ts` and `valuation.server.ts`.
- New tables: none required beyond columns; deletion and export events use the existing `compliance_audit_events`.
- Each stage: typecheck, full test suite, new tests for export shape, deletion cascade, unsubscribe token handling and retention windows, plus authenticated smoke tests before anything is published.

## Still needs an answer from outside the code

Two policy questions this work cannot settle, both needed before the privacy policy is written:
- Whether the AI provider retains prompt content and uploaded document contents. Whole inspection reports are sent to the model, so this needs confirming in writing.
- What the hosting and CDN layer logs (IP address, user agent) and for how long.
