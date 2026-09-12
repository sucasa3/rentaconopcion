# Stage 2, slice 1: My Professional Network + Home Team review

Two features only. The goal is that an agent can complete their clients' Home Teams in seconds per client, mostly by reusing a handful of people they already work with.

No invitations, no claiming, no homeowner validation, no lender preview or activation in this slice.

## Screens

### 1. My Professional Network — `/agent/network` gains a "My people" tab (first tab)
A simple list of the professionals this agent works with, derived from `professionals` + `relationships` (`agent_professional_resource`). No new contact table.

Each row shows: name, company when known, role, whatever contact details the agent themselves supplied or that are shared, how many of the agent's clients are currently assigned to that person, whether they already have a SuCasa identity, and a quiet "needs review" marker when the record has a possible duplicate.

Actions per row: **Use for clients** (jumps into review pre-filtered), **View clients**, **Edit**. Plus one **Add professional** button.

### 2. Complete Home Teams — new route `/agent/home-teams`
The important one. One client at a time, one question: who is this client's lender?

```text
32 of 74 client Home Teams reviewed          [ Skip ] [ Next ]

Kevin DeJesus
1010 Arbor Creek Dr, Marietta GA

Property data suggests: Movement Mortgage        (suggestion)
On file: none yet

  Recently used:  [ Maria Lopez ]  [ John Smith ]
  [ Search my network... ]
  [ Add a different lender ]
  [ No lender / not applicable ]   [ I don't know ]
```

- Provider-detected institutions are always labelled as a suggestion, never as the answer.
- Large tap targets, arrow-key/Enter support, recently-used people first, instant search.
- Nothing is required; skipping is a first-class choice.

### 3. Bulk apply
A "Select several" mode on the same screen: multi-select clients, pick one professional, apply. Confirmation is honest: "Maria Lopez set as the loan officer on 12 Home Teams." No scores, no invented success metrics. Progress counts only records actually reviewed.

## Flow

1. Agent opens Complete Home Teams from Agent Today or the network page.
2. Queue = the agent's portfolio clients, unreviewed first, clients with a provider suggestion before clients without.
3. Agent picks someone from their network, adds a new person, or marks blank / not applicable.
4. Picking someone writes an agent assertion and moves to the next client.
5. Finishing the queue shows a clean completion state with the number updated.

## Data reads and writes

Reads: the agent's portfolios and portfolio clients; `home_team_candidates` for that client (suggestion label + provenance); existing `relationships` for the client; `professionals` for the agent's own people.

Writes:
- **Add professional** → `resolveOrCreateProfessional()` (existing conservative resolution) + an `agent_professional_resource` relationship at `asserted`. A possible duplicate is surfaced, never silently merged.
- **Assign to a client** → `professional_homeowner_lender` at `asserted`, `source: agent_confirmation`, evidence records which candidate (if any) informed the choice.
- **Not applicable / don't know** → review state only, no relationship.
- Every action appends to the existing audit ledger.

Never written here: consent records, lender access, organization records from provider strings, invitations, subscriptions.

## Relationship state transitions

| Action | Effect |
| --- | --- |
| Agent adds a person they work with | `agent_professional_resource` → `asserted` |
| Agent names a client's lender | `professional_homeowner_lender` → `asserted` |
| Agent changes their mind | previous edge → `rejected`, new edge → `asserted` |
| Agent says "no lender" | no edge; matching suggested candidates → `rejected` |
| Agent says "I don't know" | nothing changes; client marked reviewed-unknown |
| Provider candidate used as a hint | candidate row preserved, its id kept in the edge evidence |

`asserted` is the ceiling for anything an agent does. `confirmed` stays reserved for the homeowner. An `agent_professional_resource` edge is never read as a client's lender.

## Technical details

- New files: `src/lib/agent-network.ts` (pure: queue ordering, progress counting, suggestion labelling, recently-used ranking), `src/lib/agent-network.server.ts` (reads/writes over existing canonical helpers), `src/lib/agent-network.functions.ts` (authenticated server functions), `src/routes/_authenticated/agent/home-teams.tsx`, plus a "My people" tab component in the existing network route.
- One narrow migration: `home_team_review_state` (portfolio client, org, decision `pending | assigned | no_lender | unknown`, reviewed_by/at) so "blank", "not applicable" and progress are recordable without abusing relationship or candidate status. Row-level security scoped to the owning organization. This is review bookkeeping only and is never an access basis.
- Reuses: `professionals.ts` / `.server.ts`, `relationships.ts` / `.server.ts`, `home-team-candidates.server.ts`, `org-resolution.ts`, `network-events.server.ts`, `BusinessShell`, existing agent card/typography patterns and the current colour tokens.

## Tests

- Queue ordering and progress counting are pure and deterministic; progress never exceeds reviewed records.
- An `agent_professional_resource` edge alone never yields a client lender for any client.
- Assigning a lender produces `asserted`, never `confirmed`, and writes no consent record.
- After an assignment, `classifyLenderAccess()` still returns no named homeowner access.
- "No lender" writes no edge and rejects only the matching candidate.
- Re-assignment rejects the prior edge and leaves exactly one active lender edge.
- An unresolved provider candidate renders as a suggestion string and creates no organization.
- Bulk apply across N clients writes N independent assertions and reports N honestly.
