# Stage 3 closure — run the three gates

Workflow is live, so the setup step is done. No new architecture work, no additional audits, no Stage 4, no publish until you approve.

## Gate 1 — one live STOP/START test (authorized test phone 678-485-3054)

Marketing SMS → you reply STOP → GoHighLevel sets SMS DND → webhook arrives and authenticates →
SuCasa mirrors the SMS marketing opt-out → second marketing send refused before any provider call →
you reply START → GoHighLevel clears SMS DND → webhook arrives → SuCasa records valid re-consent →
eligible marketing SMS permitted again.

Two points in the run need you at the phone: replying STOP, then replying START. I send the message,
tell you when to reply, and read the real event as it lands.

I confirm, from the real event and from GoHighLevel: event received, authentication succeeded, actual
contact DND state, SuCasa mirror, suppression applied before send, re-consent evidence recorded, no
provider STOP/DND restriction bypassed, and no readable phone number in consent or audit evidence.

If GoHighLevel's actual payload field names differ from the ones the receiver expects, I make the
minimum field-mapping change in the receiver and rerun this one test. No redesign.

Payload tolerance: the receiver accepts the fields each event actually provides. *Customer Replied /
SMS* carries phone, message, messageId, contactId and any available SMS DND state; a *DND change*
event carries phone, contactId and the SMS-specific DND state, and is not required to provide message
or messageId. Events are correlated by the GoHighLevel contact id. START re-consent evidence comes
from the actual inbound START message event; the DND-change event only confirms provider state.

Test records are deleted afterwards.

## Gate 2 — Automated verification

Full test suite, type check, production build, existing security scan. Previously resolved findings
are not reopened. The public `market_rates` informational finding stays an accepted exception.

## Gate 3 — Report

A short report only: STOP result, START result, final test count, build/type-check result,
security-scan result, READY / NOT READY. Then I stop and wait for your publish approval.

## Technical note

Only possible code change in this stage: field mapping inside
`src/routes/api/public/webhooks/ghl-messages.ts` if the live payload uses different key names.
Authentication, idempotency, messaging policy, preferences, consent evidence and every other Stage 3
behaviour stay exactly as accepted.
