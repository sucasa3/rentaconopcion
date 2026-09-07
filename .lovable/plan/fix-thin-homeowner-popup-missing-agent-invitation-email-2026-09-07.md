# Fix: thin homeowner popup + missing agent invitation email

## 1. The homeowner popup only shows email and phone

On the Client Roster page, tapping "View homeowner" opens an old contact-only panel: name, address, an email row and a phone row. It was built before the richer client intelligence existed, so it never learned about it.

Meanwhile the lender Today experience already has the full 30-Second Brief panel — why this person, why now, the financial snapshot, the suggested opener, permitted channels, outcome logging and the full Homeowner Review Brief — all behind the same permission and compliance rules.

**Fix:** replace the thin panel with the existing brief panel, so opening a homeowner from the roster gives the same depth as opening one from Today.

- Keep the tap-to-email and tap-to-call rows at the top of the panel (they are genuinely useful there).
- Everything below them comes from the existing brief: situation summary, equity/value/loan facts, why now, recommended action, opener, and the option to open the full review brief and log an outcome.
- No change to who is allowed to see what: the brief only shows what the existing access and consent rules already permit.

## 2. The agent invitation email never sends

Inviting an agent currently only records the invitation inside SuCasa. Nothing is emailed, so the person at info@sucasa.com had no way to know. The invitation itself is stored correctly and still works if the agent signs in.

**Fix:** send a real invitation email when a lender invites an agent.

- New branded invitation email: who invited them, the lender's name, their personal message if they wrote one, and a button to accept.
- Sent from the already-verified SuCasa sending domain, with the lender's reply-to when set.
- Recording the invitation never fails because of an email problem; if the email cannot be delivered the invitation is still saved and the lender is told.
- After the fix, re-send the invitation to info@sucasa.com so it actually arrives.

## Technical notes

- `src/routes/_authenticated/lender/portfolio.$id.index.tsx`: drop the local `ContactDialog` body in favour of `LenderBriefDialog` (`src/components/lender-brief.tsx`), passing the roster row's client id; keep the mailto/tel rows as a small header block inside the sheet.
- `src/components/lender-brief.tsx`: accept optional `email`/`phone` props to render those quick-contact rows; no logic change.
- `src/lib/email-templates/agent-invite.tsx` (new) registered in `src/lib/email-templates/registry.ts`.
- `src/lib/network.functions.ts` → `inviteAgent`: after the insert, look up the lender org name/reply-to and call `sendTemplateEmail('agent-invite', …)` inside a try/catch with an idempotency key derived from the connection id; return `{ ok: true, emailed: boolean }`.
- No schema changes. No change to access gates, consent, ranking, CRM or outcome logic.
