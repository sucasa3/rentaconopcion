# Separating the three SuCasa relationships

SuCasa becomes three independent products: the agent's account comes from SuCasa, the lender buys monitoring and sponsorship services from SuCasa, and the homeowner receives a Premium Home Intelligence Membership from SuCasa. No lender payment ever produces an agent benefit.

## What exists today (verified)

- Agent capacity comes from a credit ledger that includes a lender "sponsor" grant and a 5-credit "Referral or transaction" reward — both conflict with the new model.
- Lender plans are sold partly on "sponsored agents", and lender→agent seat allocations (`sponsored_agent_seats`) directly increase an agent's Home Profile capacity.
- Homeowner-level sponsorship exists (`sponsored_profiles`), but Premium itself is only a browser flag on the report page — there is no membership record, status, badge or sponsor disclosure.
- Homeowner→lender consent records exist but are not wired to a homeowner-initiated "connect me" action.

## Phase 1 — build now

### 1. Agent entitlement independence
- Every agent organization gets a SuCasa-provided base entitlement of 100 active Home Profiles, recorded with an explicit source of `sucasa`.
- Existing agents keep everything already in use; nothing is deleted or archived. Where current use exceeds the base, the record stays active and new additions are blocked until they add capacity or archive.
- Lender allocations stop granting agent capacity. Existing allocation rows are preserved for history and re-read as sponsorship of homeowner Premium, not agent capacity.
- Earned credits stay, but every transaction/referral/lender-activity reward is removed. Agents can only earn from their own platform work (activation, profile completion, engagement, service requests).
- A single policy module holds these rules with a prominent comment: agent entitlements must remain independent of lender payments and mortgage referral activity.

### 2. Premium Home Intelligence Membership
- New membership record per homeowner: status, tier, start/end, funding source (lender sponsorship, SuCasa grant, or homeowner self-purchase) and disclosure version.
- Sponsorship becomes a separate record tied to the homeowner and the sponsoring lender, never to the agent.
- Premium status badge across the homeowner dashboard ("Premium Home Intelligence — Active / Your home is being monitored"), replacing the browser-flag demo.
- Sponsor block with the approved wording and the disclosure that the homeowner is not required to use the sponsor, plus the note that they control what is shared.
- Homeowner self-purchase is architected now with a monthly price placeholder; the live price is created only after you review the amount.

### 3. "What Changed?" feed and monthly digest
Built from data SuCasa already holds — value, equity, mortgage position, permits, tax/assessment, property status, maintenance. Shown as an ongoing feed on the homeowner dashboard and assembled into a "Your Home This Month" digest with sponsor branding where sponsored.

### 4. Homeowner-controlled connection
- Opportunities get "Talk to someone about this", and where a sponsor exists, "Ask [Sponsor] about this".
- An explicit confirmation names exactly what will be shared before anything is sent.
- Each authorization writes a consent record (homeowner, recipient, type, scope, disclosure version, source, timestamp, revocation) and a compliance audit event.
- Sponsorship alone never creates a lead. Contacts a lender already owns through its own uploaded database keep their existing basis and are labelled as such.

### 5. Lender dashboard and terminology
Reorganized around My Book, Homeowners Served, Brand Impact, Relationship Network, and a highly visible "Homeowners Who Asked to Connect" bucket. Agent relationships are renamed Agent Connections everywhere. No referral rankings or loan-volume metrics anywhere in the product.

### 6. Marketing and pricing copy
Lender pages rewritten around Monitor / Serve / Connect. Pricing plans keep their current prices and Home Profile limits, and lead with profiles monitored, Premium memberships sponsored and refresh capacity; agent connections become a secondary line. Agent pages state the first 100 profiles are provided by SuCasa with no lender relationship required. All "sponsored agent", "gifted", "free accounts from your lender" language is removed.

### 7. Compliance guardrails
- Central rule layer that rejects any attempt to grant agent entitlement from a lender payment, plan, sponsorship or mortgage event.
- Compliance audit log for sponsorship, consent, sharing and entitlement changes.
- A `compliance_review_required` flag configuration for future features touching lender-paid agent benefits, lead routing, provider ranking, referral incentives or automatic data sharing.
- Internal service-delivery reporting (profiles processed, refreshes, reports, alerts, digests, sponsor impressions, CRM syncs) to substantiate what the subscription buys. No monetary value is assigned to referrals.

### 8. Acceptance tests
All eight scenarios in your list are implemented as automated checks over the entitlement, sponsorship and consent rules.

## Phase 2 — architected now, built later

AI Home Concierge, annual Home Intelligence Review, project intelligence, deeper document intelligence and maintenance intelligence, expanded property monitoring, advanced sponsor analytics. Their data shapes and entry points are reserved so they slot in without rework.

## Technical notes

- Migrations: `agent_base_entitlements`, `premium_memberships`, `premium_sponsorships`, `consent_records`, `compliance_audit_events`, `service_delivery_events`, plus a source/basis column on existing lender–homeowner links. Existing `sponsored_agent_seats` / `sponsored_profiles` rows are retained and mapped forward, never dropped.
- Capacity engine (`profile-pool.ts`, `capacity.server.ts`) gains an entitlement-source dimension so lender pool math and agent base math no longer share a path; database triggers that spend agent credit on lender allocation are reworked accordingly.
- Limits and entitlements move into a configuration table so future changes need no code edits.
- Stripe prices, plans and commitments are unchanged.

## Needs your decision before Stripe work

Homeowner self-purchase Premium price. Everything else uses existing prices.
