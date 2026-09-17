# Home Team: keep as confirmation-only (no homeowner add flow)

## Decision

`/home-team` remains the existing relationship-confirmation and
permission-management experience. No homeowner-initiated "Add your agent /
Add your lender" flow is built.

## Explicitly not built

- No homeowner-created professional invitations
- No homeowner-asserted relationship edges
- No "Add Agent" / "Add Lender" buttons
- No invitation ledger changes, no new invitation contexts
- No schema or behavior changes of any kind

## Preserved architecture

- Professionals keep homeowners in their own private workspace and receive
  SuCasa property intelligence independently.
- Appearing in a homeowner's Home Team never grants access to
  homeowner-private information.
- Homeowner consent/permissions remain the only authority for sharing.
- Multiple professionals may independently hold the same homeowner/property
  without seeing one another.

## Future work (recorded, not scheduled)

- Homeowner-initiated Home Team invitations — the homeowner adds or invites
  their own agent/lender. To be planned separately when prioritized.

## Action in this plan

- Record the decision and the future-work item in `roadmap.md`.
  (Requires leaving plan mode for that one-line bookkeeping edit — or I can
  fold it into the next approved build task.)
