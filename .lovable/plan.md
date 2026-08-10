# Next up: the Agent side of the Intelligence Network

The lender half is live: lenders can invite agents, see de-identified opportunity volume inside connected agent books, and request introductions. Everything the agent needs to respond to those requests exists on the backend (connection invites, introduction responses, sponsorships, campaign audience approvals), but there is no agent-facing screen yet — so today a lender's invite or intro request has nowhere to land.

Next step: build the **Agent Network & Approvals center**.

## What gets built

A new page at `/agent/network`, reachable as a tab from the agent portfolio (same placement as the lender's Agent network tab).

**1. Connections**
- Pending lender invitations with Accept / Decline.
- Connected lenders with a summary line and a Disconnect action.

**2. Introduction requests** (the core of it)
- Queue of lender requests for a specific homeowner in the agent's book.
- Each row shows who is asking, the opportunity category and reasons, and the client — the agent sees the full identity because it is their own client.
- Approve or Decline per request. Approving is what unlocks the lender's reveal of name/email/phone; every reveal stays audited.
- Outcome tracking on approved intros (e.g. connected, closed, no fit).

**3. Campaign audience approvals**
- Lender-proposed audience subsets from the agent's book.
- Agent approves the whole set or trims it to specific clients before anything sends.

**4. Sponsorships**
- Which of the agent's clients a lender partner is sponsoring, with allocation counts and the ability to end a sponsorship.

An "N pending" badge on the agent portfolio tab so requests do not sit unseen.

## What comes after this

- Lender side of the same loop: reveal approved contacts, track intro outcomes, propose campaign audiences, allocate sponsorships from their plan allotment.
- Plans & alerts: surface plan tiers and allocation limits in both portals.

## Technical notes

- New route `src/routes/_authenticated/agent/network.tsx`, tab link added in `src/routes/_authenticated/agent/portfolio.$id.tsx`.
- All data flows through existing server functions in `src/lib/network.functions.ts`: `getAgentNetwork`, `respondToConnectionInvite`, `listIntroductions`, `respondToIntroduction`, `listCampaignApprovals`, `respondToCampaignAudience`, `getSponsorships`, `endSponsorship`.
- No schema changes and no new migrations; database triggers already enforce immutable introduction responses and sponsorship allocation limits.
- UI follows the lender network page pattern (React Query + `useServerFn`, card sections, sonner toasts), with `robots: noindex` head metadata.
