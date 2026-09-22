# Stage 3 — Communication preferences and opt-out

Preview only. Nothing published.

## 1. What the texting provider actually does (verified in code)

- Every outbound text in SuCasa goes through one place: the GoHighLevel (LeadConnector) conversations API, via `sendProSms` in `src/lib/ghl.server.ts`. `sendVerificationSms` (account phone verification) simply calls it. There is no second texting path and no other provider in the codebase.
- SuCasa currently has **no inbound message handling at all**. The only GoHighLevel webhook route is the billing receiver (`src/routes/api/public/ghl.billing.ts`, HMAC-verified with `GHL_WEBHOOK_SECRET`). So today a person who replies STOP is handled entirely inside GoHighLevel and SuCasa never learns about it.
- GoHighLevel owns STOP/START natively: a STOP reply sets the contact's DND state there and the provider refuses further sends. That is the authoritative state.
- Consequence for this stage: **do not build competing STOP keyword parsing.** SuCasa mirrors the provider's state instead of replacing it. Two directions:
  - inbound: a new signed GoHighLevel webhook receiver (same HMAC scheme already proven by the billing route) that records opt-out/opt-in the moment the provider reports it;
  - reconciliation: when SuCasa is about to send a marketing text, read the provider's DND state for that contact and treat provider DND as blocking even if SuCasa has no local record.
- One item cannot be confirmed from code and needs your GoHighLevel account: which webhook events that account is configured to emit, and the exact secret/signature header the account sends. The receiver will be written against the existing HMAC pattern and the reconciliation read will work regardless, so nothing depends on that answer to function — but I will report it as unverified until you confirm the webhook is switched on in the provider.

## 2. Purpose is decided in one place

A single policy module classifies every message and is the only door to the senders:

- Transactional (never blocked by marketing opt-out): sign-in and verification codes, password/security notices, receipts, and updates about a service request the person themselves started.
- Marketing / relationship development (always blocked by opt-out, even when automated and even when it comes from an agent or lender): campaigns, nurture, agent and lender introduction outreach, the professional Daily Read digest, and any promotional or relationship-building message.

Every send must declare its purpose. The email helper and the text helper stop accepting anonymous calls: a send without a declared purpose fails, so no feature can quietly go around the check. A test asserts this.

## 3. Send paths audited and routed through the check

All existing outbound paths, each gaining a declared purpose and the policy check:

| Path | Purpose |
| --- | --- |
| Campaign sends (`campaigns-run.server.ts`, both send sites) | marketing |
| Agent/lender outreach sends (`outreach.server.ts`) | marketing |
| Introduction invitations (`introductions.server.ts`) | marketing |
| Daily Read digests (`daily-read.server.ts`) | marketing |
| Agent network invites (`network.functions.ts`) | marketing |
| Professional invitations (`professional-invitations.server.ts`) | marketing |
| Lender pilot request (`api/public/lenders.pilot.ts`) | transactional (person's own submission) |
| Account security alerts and email-change confirmation (`account.server.ts`) | transactional |
| Auth emails (sign-in, recovery, reauthentication, magic link) | transactional |
| Provider/lead texts (`leads.server.ts` via `sendProSms`) | marketing unless it concerns a job that provider already accepted |
| Phone-verification text (`sendVerificationSms`) | transactional |
| CRM sync pushes (`ghl.server.ts` contact upsert) | carries the person's preference forward so provider-side automations inherit it |

## 4. Email unsubscribe

Every marketing/relationship email gets an unsubscribe link in its footer. The link:

- works in one click, with no sign-in, and works with an expired session;
- carries a signed, tamper-resistant token that identifies only the recipient identity needed to record the opt-out — no name, no account details;
- writes the opt-out **before** the confirmation page renders;
- records channel, scope, source and timestamp;
- is honoured by anything already queued: the queue re-checks preferences at send time, so a message queued before the opt-out is dropped rather than delivered.

The confirmation page may offer further preference choices, but the unsubscribe itself never requires them. That public page shows no private profile information and allows nothing beyond communication preferences.

## 5. Preference centre

On the Account page, three independent controls — marketing email, marketing texts, marketing calls — clearly separated from essential account and service messages, with a line explaining that account, security and service-request messages continue either way. English and Spanish.

Turning texts back on is not a simple switch: when renewed consent is legally required, the person is shown an explicit consent statement and SuCasa stores the exact wording and version, the timestamp, the phone number and channel, the source, the provider message id or web event id where one exists, and the IP/user agent for web consent when available. A provider-side STOP stays authoritative until such a re-consent happens.

## 6. Calls and organisation-held records

- Do-not-call becomes functional from the preference centre and is honoured by SuCasa call queues, Today recommendations, campaign workflows and automated outreach. Existing historical records are left intact — disabling calls is not a deletion.
- Where an agent or lender holds their own client record, a homeowner's preference blocks SuCasa-powered outreach to that person through that organisation. The professional sees only the minimum: "contact preference prevents outreach" — never the person's account details or which preference they set.

## 7. Audit trail

Each preference or consent change records prior state, new state, channel, scope, source, timestamp, and the consent wording/version where consent was required. Message bodies are not stored.

## 8. Tests

New tests for: unsubscribe without sign-in; invalid, expired and tampered tokens; a message queued before an opt-out being dropped; provider STOP synchronisation; START/re-consent requiring stored consent evidence; email, text and call preferences behaving independently; transactional messages still delivered after a marketing opt-out; introduction messages suppressed as marketing; outreach blocked across organisations; the purpose tag being required; and a direct call to the sender without a purpose being rejected.

## 9. Verification before handing back

Typecheck, full test suite, production build, security scan, and signed-in plus public smoke tests (preference centre for homeowner/agent/lender, a real unsubscribe click while signed out, Agent Today, Lender Today, both View homeowner screens). Then a report covering the provider behaviour verified, every send path audited, results, test count, and anything unresolved.

## Technical notes

- New module `src/lib/messaging-policy.server.ts`: purpose enum, per-person preference read, provider-DND reconciliation, and a single `assertSendAllowed` gate. `sendTemplateEmail` and `sendProSms` require a purpose argument and call it.
- Person-level preferences and consent evidence stored in new tables (preferences keyed to the person, consent evidence append-only); `outreach_channel_permissions` stays as the per-organisation layer and is read on top of the person-level preference, with the stricter of the two winning.
- Unsubscribe token: HMAC-signed like `tracking.server.ts`, with an expiry and a purpose claim, served by a new public route; opt-out written before render.
- Inbound provider receiver at `src/routes/api/public/webhooks/ghl-messages.ts`, HMAC-verified against `GHL_WEBHOOK_SECRET`, idempotent on the provider message id.
- No change to ranking, eligibility, opportunity generation, canonical reasons, opener logic, outcomes, or the approved Today and View-homeowner screens.
