# Post-call voice note + automatic follow-up

A professional finishes a call, taps "Tell SuCasa how it went", speaks for a few seconds, reviews what SuCasa understood, and saves. The follow-up then comes back on its own in Today at the right time.

## Step 0 — Publish the already-approved Batch 1 translation

Batch 1 passed every gate (391 tests, clean typecheck and production build, security scan shows zero dependency findings). It publishes first, on its own, before any new work lands.

## Audit — what already exists (nothing duplicated)

- **Call buttons**: one shared component renders the Call/Text/Email actions (`tel:` links) on the agent and lender Today queues and on the client detail views.
- **Outcomes**: stored in the existing `opportunity_outcomes` table — one row per touch, with who, when, stage (`no_answer`, `talked`, `appointment`, `application`, `closed`, `not_interested`), a note, and — importantly — `next_step` and `next_step_due_at` fields that already exist.
- **Follow-ups**: there is no separate reminder system, and none will be added. The most recent outcome's next step and due date ARE the follow-up. Both Today screens already read these: the lender side computes overdue days and feeds them into ranking; the agent queue reads the last outcome per opportunity.
- **History**: `opportunity_outcomes` is additive and auditable — new rows never overwrite old ones.
- **AI plumbing**: the app already calls Lovable AI server-side with strict JSON schemas validated before use. Confirmed available: a speech-to-text model and the default chat model, both with zero data retention.
- **Recording**: nothing exists yet — no microphone code, no audio storage. Audio will be transcribed and discarded; only the transcript is kept.

## What gets built

**1. One new table: `professional_conversations`** (additive migration, nothing existing changes)
Holds the rich record: original transcript, detected language (English/Spanish/mixed), AI summary, outcome, key facts with confidence, next step, follow-up date + the original natural phrasing ("first week of January"), suggested opener, who created it, which client/property/workspace, source = post_call_voice, and which fields the professional edited by hand. Row-level security mirrors the existing workspace rules — a professional only ever sees their own book.

**2. Transcription** (server route)
The browser records a short clip (5s–2min). The server sends it to the speech-to-text model, which auto-detects English, Spanish, or mixed — no language picker. The audio is never stored; only the transcript returns.

**3. AI interpretation** (server function)
The transcript plus limited context the professional can already see (client name, their role, property, current signal, last outcome, existing next step) goes to the chat model with a strict output schema: summary, language, outcome (mapped onto the EXISTING stage vocabulary — no new statuses), key facts, next step, follow-up (required / resolved date / original timeframe text / reason), suggested opener. Dates are resolved in the professional's own timezone; approximate phrasing keeps its original text. Bad or malformed output fails safely — nothing is written.

**4. Save** (server function, only after the professional confirms)
One conversation row + one outcome row carrying the next step and follow-up date. Because follow-ups already flow from that outcome row, the relationship resurfaces in Agent Today / Lender Today through the existing ranking with zero changes to those screens' logic.

**5. Interface** (matches the current Today design, EN + ES)
"Tell SuCasa how it went" appears beside the existing Call action on Today (both roles) and the client detail view. Mic button, typed-note fallback, Cancel. Review panel: summary, outcome, next step, follow-up, things learned, suggested opener — every field editable. Save & schedule / Save without follow-up / Cancel. Cancel writes nothing.

## Safety boundaries (unchanged)

Never sends a text/email/call, never changes consent, never creates financial recommendations, never writes to property or contact records. AI facts live only in the conversation record as relationship intelligence. No new homeowner access for lenders; no cross-workspace exposure.

## Tests

English, Spanish, and mixed transcripts; exact date, "next Friday", "first week of January" (date chosen but original phrasing kept); no follow-up needed; professional edits the outcome and the date before saving; cancel saves nothing; cross-workspace access denied; prior history intact; saved follow-up feeds the existing Today inputs; malformed AI output corrupts nothing.

## Verification before you review

Typecheck, full test suite, production build, and a browser walkthrough as both the test agent and test lender in English and Spanish. Nothing publishes until you approve the result — except Batch 1 (step 0), which you already approved.
