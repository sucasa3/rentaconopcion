# Next Stage 2 slice: agent → lender Home Team invitations

## Corrections just delivered (already live)

1. **Homeowner-confirmed Home Teams count as complete.** Completion is derived
   (`reviewed` OR homeowner-confirmed lender on file), never written as a fake
   agent review row. The denominator stays every applicable active client, so a
   locked record can no longer make the queue impossible to finish.
2. **The chosen workspace follows the agent.** Complete Home Teams opens on
   `?orgId=<workspace>`; the id is honoured only if the agent belongs to it,
   falls back safely, and every server call still re-checks membership.
3. **Workspace edits stay in the workspace.** Name, company, email and phone a
   workspace types live on that workspace's own edge. The shared registry is
   only rewritten when the record is unclaimed *and* no other workspace
   references it. A claimed, verified professional's own identity wins.

Typecheck clean; 189 tests pass, including the three new groups.

## What this next slice builds

The agent has now said "this client's loan officer is Maria". The slice turns
that into an invitation Maria can accept, and a homeowner validation path that
never leaks a homeowner before consent exists.

### 1. Typed invitation lifecycle

One canonical home: `professional_invitations` (already the invitation home in
the architecture). Add a `context` so the same table serves distinct purposes
without overloading meaning:

- `agent_invites_professional` — new in this slice
- existing agent/lender organization invite contexts untouched

Lifecycle: `pending → sent → accepted | declined | expired | revoked`.
Reuse the existing HMAC-signed, timing-safe, expiring, revocable token
primitives from the agent invite work — no second token scheme.

The invitation never changes the relationship graph on its own. An agent
assertion stays `asserted` whether or not the invitation is accepted.

### 2. Professional claim handoff

Accepting an invitation is how an unclaimed `professionals` row becomes a real
person's account:

- verify token, then require the accepting user to be signed in
- link `professionals.user_id`, set `claim_status = 'claimed'`
- verify the contact channel the invitation was actually delivered to
- from then on that person's canonical identity is authoritative, and every
  workspace display falls back to it (the rule shipped above)
- wrong-account protection: signed in as someone else → explain, do not link

Claiming grants the professional their own identity. It grants no homeowner
access whatsoever.

### 3. Access-safe homeowner validation

The only path by which a named homeowner becomes visible stays
`consent_records` + `classifyLenderAccess()`. This slice adds the request:

- the homeowner is asked to confirm "is Maria your loan officer?"
- confirmation writes `confirmed` on `professional_homeowner_lender` and, only
  where the homeowner grants it, a scoped consent record
- until then the professional sees aggregate/de-identified context only
- the wrong-John regression is extended: invited + claimed + agent-asserted,
  with no consent, still returns no named access

### 4. Events

Add to the existing `compliance_audit_events` vocabulary:
`professional_invitation_created/sent/accepted/declined/expired/revoked`,
`professional_identity_claimed`, `homeowner_validation_requested`,
`homeowner_validation_confirmed/declined`.

### 5. Screens

- Professional network → per person: "Invite to SuCasa" with honest state
  (not invited / invited / on SuCasa)
- public invitation landing + authenticated acceptance, mirroring the existing
  agent invite pages
- no new homeowner surface beyond the validation ask

### Out of scope for this slice

Paid lender activation, aggregate previews, capacity/active-waiting UI, Closing
Partner, and any removal of legacy Credits/Sponsorships tabs.

### Tests

Token forgery/expiry/revocation; idempotent double-accept; wrong-account;
claim makes canonical identity authoritative across workspaces; invitation and
claim grant no named homeowner access; homeowner confirmation is authoritative
over the agent assertion; invitation state is not relationship state.
