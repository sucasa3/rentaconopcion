# Homeowner-initiated Home Team: add your agent or lender

## What exists today

`/home-team` is a confirmation screen only. A professional appears there when an
agent workspace asserted the relationship (`relationships` row, type
`agent_homeowner` or `professional_homeowner_lender`, status `asserted`), and
the homeowner confirms truth ("Is this your lender?") then separately chooses
whether to share. There is no homeowner-initiated add anywhere.

## What we build

A homeowner can add their own agent or lender from the Home Team page, with the
same safety rules as the existing invitation flow.

### 1. "Add" entry points on the Home Team page

- The empty state gains two actions: "Add your agent" and "Add your lender".
- When pending confirmations exist, the same two actions appear at the bottom.
- The dashboard Home Team card's empty slots (agent / lender) link here too.
- Bilingual (English/Spanish), matching the existing page copy.

### 2. Add dialog (name + email, one at a time)

- Fields: role (agent or lender, preselected by which button was tapped),
  professional's name, professional's email, optional personal note.
- Plain-language framing: "We'll invite them to SuCasa and ask you to confirm
  before anything is shared."

### 3. Server flow — reuse, don't reinvent

- New server function `homeownerInviteProfessional` in
  `src/lib/professional-invitations.functions.ts`, authenticated, homeowner
  scoped to their own user id.
- Identity resolution stays conservative: look up `professionals` by
  `email_normalized` only. Exact email match on an unclaimed record → reuse it.
  No match → create a new unclaimed professional record. No fuzzy matching, no
  auto-claiming, no merging (same wrong-John safeguards as Stage 1).
- Create the relationship edge as `asserted` with evidence noting the homeowner
  self-reported it (`source: "homeowner_asserted"`) — evidence, not permission.
  The homeowner's own assertion means the relationship is treated as
  homeowner-confirmed from the start (they told us), but confirming truth still
  shares nothing.
- Send an invitation email to the professional through the existing
  `professional-invite` template + typed HMAC token flow, with invitation
  context `homeowner_invites_professional`. Claiming still requires a signed-in,
  verified, matching email — and grants no access to anything.
- One live invitation per professional per homeowner; re-running reuses or
  supersedes exactly like the agent flow.

### 4. What the homeowner sees after adding

- The professional appears on the Home Team page as "Invited — waiting for them
  to join" (status from the invitation ledger, no new tables).
- Once the professional claims their profile, they show as "On SuCasa".
- The separate share question ("Would you like to connect and share anything?")
  is offered only after the professional is on SuCasa — same scopes, nothing
  pre-selected, homeowner can change their mind later.

### 5. What this never does

- No homeowner access is granted to anyone by adding or inviting.
- The invited professional sees no homeowner, property, mortgage, or
  opportunity data — the invite email stays relationship-only.
- `classifyLenderAccess()` + `consent_records` remain the only access authority.
- No change to the agent-side flows, the agent invitation context, capacity
  counting, or the Daily Read.

## Technical notes

- `src/lib/professional-invitations.server.ts`: extend invitation context to a
  second value; the ledger/unique index is per (context, inviter, professional)
  so homeowner invitations don't collide with agent ones. Reuse
  `inviteProfessional` internals with a homeowner variant (inviter = homeowner
  user id, no org). Homeowner org requirement (`requireAgentOrg`) does not
  apply; authorization = the signed-in user inviting for their own home.
- `src/lib/professional-invitations.ts`: add the new context to
  `invitationDisplayState`/`mayResend` handling.
- `pendingValidations`/`homeTeamSummary` need to also read
  homeowner-asserted edges (they already read `asserted` status, so mainly the
  inviter/evidence shape differs).
- Homeowner Home Team page: list invited-but-not-yet-on-SuCasa professionals
  alongside pending confirmations; resend/withdraw for the homeowner's own
  invitations.
- Events logged in `compliance_audit_events`, no homeowner PII.
- Tests: homeowner can invite; duplicate invite doesn't double-send; wrong
  account can't claim; claiming grants no access; homeowner-asserted edge shows
  on Home Team; consent scopes unchanged.
