# Agent communication channels: recommendation vs. permission

## Why some clients only show "Write email"

Two separate causes, both confirmed in the code:

1. The agent card offers a channel only if it is the single channel SuCasa recommends. Ana ("send a home value update") therefore shows email only; Miguel ("offer a trusted pro") shows Text plus email. Call and Text are being hidden purely because they aren't the recommendation.
2. Agent-side availability is currently inferred from nothing more than "is there a phone/email on the record". That is the wrong test in the other direction too: contact data is not permission.

The lender side already separates these properly: it evaluates each of Call, Text and Email independently against relationship, recorded permission, suppression flags and contact data, and returns a reason when a channel is unavailable.

## What we'll build

**One shared channel-eligibility model, role-correct policy underneath.**

A single interface used by every professional surface:

```text
getAvailableContactChannels({ role, access, permissions, contact, recommended })
  -> { call:  { available, recommended, unavailableReason },
       text:  { available, recommended, unavailableReason },
       email: { available, recommended, unavailableReason } }
```

- The shape and the UX are identical for agents and lenders.
- The policy behind each channel stays role-specific. Agent rules are not replaced with lender rules, and agent access is not widened to match.
- Recommendation only sets emphasis. Availability comes from permission plus contact data.

**Agent channel policy (centralised, not invented):** for each channel, in order — homeowner opt-out wins; then the relationship must permit named individual contact; then the required contact detail must exist; then an explicit recorded permission, or the agent's own documented client relationship, permits a manual one-to-one touch. Automated/campaign sending still requires explicit recorded permission, unchanged. This mirrors the structure already proven on the lender side while reading the agent's own relationship and consent records.

**On the card:** the recommended channel is the filled primary button; other eligible channels sit beside it as secondary. Unavailable channels are not spelled out in three disabled buttons — the card stays clean, with a small, tappable "Why?" affordance revealing the specific reason ("Phone number not available", "Text permission not available", "Homeowner opted out of texts"). When nothing is available, a single polished line replaces the action row instead of an empty area.

**Outcome logging is unchanged.** Call records a call attempt, Text a text attempt, Email an email activity — exactly as today. Ranking and recommendation semantics are untouched.

**Applied everywhere on the agent side** in the same change: Your Best Move, Next Up, Who to contact today, contact cards, opportunity drawers, listing opportunity detail, suggested outreach, generated briefs with actions, and the first-run walkthrough when it uses a real homeowner.

## Technical notes

- New `src/lib/contact-channels.ts` — the shared, pure, client-safe model above, with a role-dispatched policy. Lender policy delegates to the existing `channelDecision`/`allowedChannels` in `src/lib/lender-access.ts` (no behavior change, no duplicate rules). Agent policy is a sibling function reading the agent org's relationship basis and `outreach_channel_permissions` rows (already org-scoped, so agent orgs are supported with no schema change).
- `src/lib/nba.server.ts` — the queue item gains permission/suppression fields and contact-detail flags alongside the existing recommended `channel`, so the client can evaluate all three channels without a second round trip. Ranking untouched.
- `src/lib/agent-daily.ts` — `availableChannels()` is replaced by a call into the shared model; the current "phone exists therefore callable" logic is removed.
- `src/components/action-queue.tsx`, `src/components/agent-today.tsx`, agent opportunity drawer/detail and brief action rows — render the shared model: primary = recommended, secondary = other eligible, subtle "Why?" for the rest.
- `src/components/lender-contact-card.tsx` moves onto the same rendering model with identical resulting permissions.
- Tests: new `src/lib/contact-channels.test.ts` covering cases A–I (all eligible; phone only; email only; phone present but text not permitted; opt-out; recommended-email with call/text eligible; recommended-text with all eligible; no usable channel; same homeowner seen by agent vs lender giving role-correct results). Existing `lender-access.test.ts` and `agent-daily.test.ts` stay green to prove no rule drift.
- No schema change expected.

## Explicitly not doing

- Not weakening any agent access rule to match the lender's.
- Not creating a second permission system — the existing gate is centralised, not copied.
- Not enabling any automatic outbound communication.
