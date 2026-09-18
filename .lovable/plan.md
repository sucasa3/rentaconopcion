# Lender → Agent Introductions: anonymous → agent offer → homeowner acceptance → reveal

## What the current code actually does (audit)

Traced `src/lib/network.server.ts`, `src/lib/network.functions.ts`, `src/components/lender-network-workspace.tsx`, `src/components/lender-introductions-panel.tsx`, `src/routes/_authenticated/agent/network.tsx`, the `introduction_requests` / `introduction_reveals` / `consent_records` tables and their policies.

Violations of the required sequence today:

1. **The lender sees per-homeowner rows, not aggregates.** `deidentifiedOpportunities` returns one row per opportunity with score, reasons, equity/LTV/tenure bands and city/state/ZIP, and the lender workspace renders them as a selectable list. That is a drill-down into individual homeowners.
2. **The lender requests an introduction on one specific homeowner** (`requestIntroduction` takes an `opportunityId`), which is exactly the "lender picks a person" model the brief forbids.
3. **There is no homeowner step at all.** Agent approval sets status `approved`, and `revealApprovedContact` then hands the lender name, email, phone and street address. Agent approval is currently the reveal trigger.
4. **The reveal is over-broad**: it returns address and all contact fields regardless of any channel permission.
5. **No state model**: `status` is only `pending / approved / declined / withdrawn`. No homeowner-accepted, connection-active or revoked state, and no revocation path.
6. **No consent evidence**: nothing records what disclosure text, lender name, channels or language a homeowner was shown, because the homeowner is never asked.
7. **Lender copy** says "Open a connected agent's book and request an introduction on an opportunity" — book/lead framing.

Not violations, keep as-is: RLS keeps lender orgs out of agent client tables; `consent_records`, `outreach_channel_permissions`, `classifyLenderAccess`, contact-channel gating, and Campaign Approvals (explicitly out of scope).

## Target state machine (server-authoritative)

```text
anonymous_opportunity
  -> lender_requested        (lender asks; no homeowner named anywhere)
  -> agent_declined | agent_offered   (agent picks the client privately)
  -> homeowner_declined | homeowner_accepted
  -> connection_active       (channels the homeowner authorized only)
  -> permission_revoked
```

Every data-access decision derives from this state on the server. Before `homeowner_accepted`, no code path returns identifiable homeowner data to a lender caller.

## Changes

### 1. Lender surface becomes aggregate-only
- New `aggregateOpportunities(lenderOrgId, agentOrgId)`: returns `{ category, label, explanation, count | suppressed }` only. No geography, no bands, no dates, no rows, no ids.
- Small-count privacy threshold (k = 5) enforced in that function: below it, return `suppressed: true` and the UI shows "Opportunity detected" instead of a number.
- `deidentifiedOpportunities` and its server function are removed from lender-reachable code (the per-client shape stays available only to the agent's own workspace, where it already belongs).
- Lender request UI moves to per-category: "Request an introduction" on a category, not on a person.

### 2. Introduction record gains the real lifecycle
Migration on `introduction_requests` (additive):
- `state` text with a CHECK for the seven states above, plus `agent_org_id`-scoped index.
- `portfolio_client_id` becomes nullable (the client is unknown until the agent offers). This is a `DROP NOT NULL`, so the migration tool will pause for explicit confirmation.
- Timestamps: `lender_requested_at`, `agent_offered_at`, `homeowner_invited_at`, `homeowner_responded_at`, `revoked_at`.
- Homeowner invitation fields: `invite_token_hash`, `invite_expires_at`, `invite_used_at`, `invited_email`, `invite_viewed_at`, single-use.
- `legacy_migration_reason` text, so migrated rows are identifiable in the audit trail.
- Existing `status` column is left untouched for history; `state` is the authority.

New append-only table `introduction_consent_events` holding the full evidence list: introduction request id, homeowner/client id, agent org, lender org + exact lender & company name presented, delivered email, sent/viewed/responded timestamps, decision, channels selected, disclosure version, language, IP/user-agent, revocation status and timestamp. RLS: agent and lender orgs read their own rows (lender rows expose no homeowner PII columns beyond what acceptance already unlocked); no client-side writes.

Acceptance also writes the existing canonical records: a `consent_records` row (`consent_type: 'connection_request'`, scope = authorized channels) and an `outreach_channel_permissions` row limited to authorized channels.

### 3. Legacy rows frozen
Data update (not a migration): every current `approved` row gets `state = 'agent_offered'` and `legacy_migration_reason = 'legacy_pre_consent_workflow'`. Original `status`, timestamps and `introduction_reveals` history are preserved untouched. No consent is backfilled, no invitation is sent automatically. Reveal is blocked for these rows until a homeowner accepts under the new flow; previously revealed contacts are not re-served by the API.

### 4. Agent step
On `/agent/network` → Introductions: the request shows lender name, company, category and the agent's own matching clients (private, agent-side data only). Actions: **Offer introduction** (choose client), **Not now**, **Decline request**. No credit, capacity, entitlement, ranking, pricing or metric is written on any of these transitions — enforced by a test asserting no entitlement/credit/ledger write occurs on any introduction transition.

### 5. Homeowner step
- Signed-in homeowners with a linked account see the request in-app (dashboard alert surface). Home Team is not reintroduced.
- Unlinked imported clients get a SuCasa-sent, single-use, expiring, hashed-token email from the agent/SuCasa (never lender marketing), reusing the existing professional-invitation token approach.
- New public route `/introduction/$token`, server-mediated: identifies agent, lender name, company and the general purpose. Headline "Would you like to connect with [Lender]?", actions "Yes, connect me" / "No thanks". No account required; account creation may be offered afterwards only.
- On accept: individual **Call / Text / Email** checkboxes, none preselected, with the required TCPA-style disclosure rendered immediately next to the confirm control, naming the lender company, lender, and the exact phone/email being authorized, versioned as `intro_consent_v1` and available in English and Spanish.
- Decline, no action, expired or already-used token → nothing is revealed, and the event is recorded.

### 6. Reveal is minimal and channel-scoped
`revealApprovedContact` becomes `revealAcceptedIntroduction`: requires `state IN ('homeowner_accepted','connection_active')`; returns homeowner name, acceptance fact, category context, and only the contact values for authorized channels. No street address, no property, no valuation, no equity, no mortgage, no documents. Home Profile access continues to flow solely through the existing consent architecture.

### 7. Revocation
New server function lets the homeowner withdraw per channel or entirely: sets `state = 'permission_revoked'`, revokes the `consent_records` row, writes suppression flags (`do_not_call/text/email`) so SuCasa-sent messaging on the lender's behalf stops immediately, and appends a revocation event. History is never deleted. SMS STOP handling continues to feed the same suppression state, and revocation is available from the email link, the in-app surface and reply keywords.

### 8. Copy
- Agent empty state replaced with the approved wording (anonymous counts, agent decides, "Their information isn't shared unless they accept"), tightened for mobile.
- Lender vocabulary: Anonymous opportunities · Request an introduction · Awaiting agent review · Awaiting homeowner response · Homeowner accepted · Permission withdrawn. No "leads", "your clients", "unlock", "claim", "view opportunities".

## Verification
- New pure module `src/lib/introductions.ts` + unit tests for the state machine, allowed transitions, reveal gating, k-anonymity suppression, and channel scoping.
- Server-shape tests: lender aggregate payload contains no identifying key; reveal throws in every pre-acceptance state; declined/expired/used token reveals nothing; economic guardrail test.
- Playwright at 390px and 1280px: lender aggregate view (with a network-response check for identifying fields), agent offer/decline, homeowner consent page in both languages, revocation.
- `bunx tsgo --noEmit` and the full existing suite (289 tests) must pass. Campaign Approvals untouched. No production publish.
