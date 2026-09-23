# Stage 3 closure — three gates, nothing more

No new architecture work, no additional audits, no Stage 4, no publish until you approve.

## Gate 1 — GoHighLevel setup, then one live STOP/START test

### Configure this once (preview receiver)

1. Automation → Workflows → **+ Create Workflow** → Start from scratch. Name it `SuCasa STOP/START mirror`.
2. **Add trigger** → *Customer Replied* → Reply channel = **SMS**. Save.
3. **Add trigger** (same workflow) → *Contact DND* (choose the trigger that fires when DND changes; if your account names it *Contact Changed*, add filter DND = any change). Save.
4. **+ Add action** → **Webhook**.
   - Method: `POST`
   - URL: `https://project--94429f0c-1687-4b34-81a7-6195279589c3-dev.lovable.app/api/public/webhooks/ghl-messages`
   - Headers: add one custom header — key `x-sucasa-webhook-token`, value = the secret you generated earlier and pasted into the secure form. (Say the word if it's lost and I'll issue a new one for you to paste.)
   - Custom data / payload fields:
     - `phone` = {{contact.phone}}
     - `message` = {{message.body}}
     - `messageId` = {{message.id}}
     - `contactId` = {{contact.id}}
     - `dnd` = {{contact.dnd}}
5. Save, then toggle the workflow **Publish** on.

Tell me when it's on and I run the test — no further questions.

### The one test (authorized test phone 678-485-3054)

Marketing SMS → you reply STOP → GoHighLevel sets SMS DND → webhook arrives and authenticates →
SuCasa mirrors the SMS marketing opt-out → second marketing send refused before any provider call →
you reply START → GoHighLevel clears SMS DND → webhook arrives → SuCasa records valid re-consent →
eligible marketing SMS permitted again.

I confirm, from the real event and from GoHighLevel: event received, authentication succeeded, actual
contact DND state, SuCasa mirror, suppression applied before send, re-consent evidence recorded, no
provider STOP/DND restriction bypassed, and no readable phone number in consent or audit evidence.

If GoHighLevel's actual payload field names differ from the ones the receiver expects, I make the
minimum field-mapping change in the receiver and rerun this one test. No redesign.

Payload tolerance (your clarification): the receiver accepts the fields each event actually provides.
*Customer Replied / SMS* carries phone, message, messageId, contactId and any available SMS DND state;
a *DND change* event carries phone, contactId and the SMS-specific DND state, and is not required to
provide message or messageId. Events are correlated by the GoHighLevel contact id / provider
identifiers. START re-consent evidence comes from the actual inbound START message event when
available; the DND-change event confirms the provider state change. Idempotency for message-less DND
events uses contact id + DND state + event time, not a fabricated message id.

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
