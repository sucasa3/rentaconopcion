# Stage 3 final verification

No publishing, no Stage 4, no unrelated changes. Two deliverables: a working, verified
STOP/START mirror with GoHighLevel, and a written review of the remaining security findings.

## 1. Inbound event authentication

The inbound receiver currently expects a signature computed over the request body — the scheme
SuCasa invented for its billing receiver. A GoHighLevel workflow webhook cannot compute that; it
can only send fixed headers. So the receiver is changed to accept a fixed shared-secret header,
which is what your GoHighLevel workflow can actually send.

- New secret `GHL_INBOUND_WEBHOOK_TOKEN` (generated, never shown to anyone; you paste the same
  value into the workflow header).
- Receiver accepts either a valid fixed-token header or the existing body signature, compared in
  constant time, so the billing-style scheme keeps working and nothing else changes.
- Requests without a valid token are rejected with 401 and nothing is written.
- Idempotency on the provider message id stays exactly as built.
- No keyword logic is added or expanded. GoHighLevel remains the authority on STOP/DND; SuCasa
  only mirrors the state it reports and keeps re-checking do-not-disturb before each marketing text.

## 2. Confirming the actual GoHighLevel configuration

Steps I will give you, precisely, with the URL and header value to paste:

1. In GoHighLevel, create a workflow triggered by an inbound customer reply, plus a second
   trigger on the contact's do-not-disturb / STOP state changing.
2. Add a Webhook action pointing at SuCasa's inbound receiver, with the custom header.
3. Reply STOP from the test phone.

I then confirm, from SuCasa's side and from GoHighLevel's API: which event actually arrived and
with what fields, that the header was present and accepted, and that the contact's do-not-disturb
state is set in GoHighLevel. Whatever arrives is recorded as the confirmed event shape.

## 3. Controlled STOP test (test phone 678-485-3054)

1. Create a throwaway test contact/record holding that number, marketing texts allowed.
2. Send one marketing text through the normal path.
3. You reply STOP.
4. Verify in order: GoHighLevel shows do-not-disturb set; SuCasa received the event and the
   receiver accepted it; marketing texts for that number are now blocked; a second marketing send
   attempt is refused before anything leaves SuCasa; the audit record holds prior state, new
   state, channel, scope, source, time and the provider message id, with no readable phone number.
5. Also confirm a transactional message (a verification code) still goes through.
6. Delete the test rows afterwards.

## 4. START / re-consent test

1. You reply START from the same number.
2. Verify the receiver records renewed consent with the evidence that channel offers — keyword,
   time, number, provider message id and source — and that marketing texts are permitted again.
3. Verify that with no evidence present nothing is renewed (already covered by tests; re-checked
   against the live path).
4. Verify the web path separately: turning texts back on in the account screen requires the
   explicit consent statement and stores its wording and version.
5. Delete the test rows afterwards.

## 5. Security findings review — report only, no fixes

For each of the five findings (one error-level, three lender consent/outreach warnings, and the
one you previously accepted) I report: the exact table, policy, function or file; what the scanner
believes is wrong; the real-world risk; whether it could expose homeowner data, bypass consent or
suppression, permit unauthorized outreach, or cross an organization boundary; whether Stage 3
already mitigates it; and a recommended disposition (fix before publish / documented acceptable
exception / false positive). Particular attention to any path that could let a lender identify or
contact a homeowner outside the required relationship and consent rules. Nothing is fixed or
ignored in this stage without your say-so.

## 6. Validation and final report

Type check, full test suite, production build, fresh security scan. New tests for the fixed-token
header: valid token accepted, missing token rejected, wrong token rejected, body-signature path
still accepted.

Final report covers: confirmed webhook event(s) and header verification; STOP test result;
START/re-consent result; the five findings with recommendations; test count; type-check and build
status; and a clear recommendation on whether Stage 3 is safe to publish. Then I stop.

## Technical notes

- `src/routes/api/public/webhooks/ghl-messages.ts` — accept `x-sucasa-webhook-token` (constant-time
  compare against `GHL_INBOUND_WEBHOOK_TOKEN`) in addition to the existing `x-sucasa-signature`
  HMAC path; no change to payload parsing, idempotency, or the stop/start dispatch.
- No change to `messaging-policy.server.ts`, `ghl.server.ts`, preference storage, ranking,
  eligibility, opportunity generation, canonical reasons, opener logic, outcomes, Today screens or
  View-homeowner screens.
- Receiver URL for the workflow: the stable production endpoint
  `https://sucasa.com/api/public/webhooks/ghl-messages` (preview endpoint used first for the
  controlled test, since Stage 3 is not published).
