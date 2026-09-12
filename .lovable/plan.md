# SuCasa Organic Growth Architecture — Audit + Revised Build Plan

## A. What already exists and stays canonical

| Concern | Canonical today | Decision |
| --- | --- | --- |
| Homeowner record | `lender_portfolio_clients` (+ `home_profiles`, `property_intel`) | Reuse unchanged |
| Homeowner access / 4 permission types | `classifyLenderAccess()` (`src/lib/lender-access.ts`) + `consent_records` | **Only** access authority |
| Invitation security primitives | `invite-token.server.ts` (HMAC, expiry, revocation), `/agent-invite` | Reuse primitives, typed contexts |
| Agent↔lender org connection | `agent_lender_connections` | Stays the only org-connection lifecycle |
| Organizations & membership | `lender_orgs` (`org_type`), `lender_members`, `is_lender_member/manager` | Organizations stay canonical |
| Plans / capacity / Stripe | `plan_tiers.profile_allowance`, `lender_orgs`, `capacity.server.ts`, `profile-pool.ts` | Capacity always from config; never hardcoded |
| Agent entitlement | `agent_base_entitlements`, `entitlements.ts` | Lender money can never fund it |
| Lender Today / My Book | `lender-workspace.server.ts`, `lender-daily.ts` | Add an active/waiting filter only |
| Enrichment | `enrichment.server.ts`, `provider-primary.server.ts`, `batchdata-normalize.ts` | Extend with candidate extraction |
| Event ledger | `compliance_audit_events` (category, action, actor, org, entity, metadata) | **Reuse for growth analytics — no `network_events` table** |

## B. New models: three tables only

1. **`professionals` — individual people, never organizations.** Fields: `org_id` (FK `lender_orgs`, nullable), role(s), name, normalized email/phone (+ verified flags), NMLS/license, `claim_status`, `verification_status`, `user_id`. Claim/verification lifecycle lives here and nowhere else. `pros` (service vendors) stays separate. A detected BatchData institution is stored as evidence text on the relationship until it resolves to an existing `lender_orgs` row — no duplicate org records. If closing firms are needed later, the smallest safe change is one extra allowed `lender_orgs.org_type` value.
2. **`relationships` — real-world relationship + evidence only.** `relationship_type`, subject/object typed refs, `org_id`, `source` (provenance), `source_record`, `status` ∈ `detected | suggested | asserted | confirmed | rejected | revoked`, `confidence`, `evidence` jsonb, `asserted_by`, `confirmed_by`, `confirmed_at`, `consent_record_id` (reference only), `source_relationship_id`, `visibility`, timestamps, `revoked_at`. **No** invitation, claim, connection, subscription or permission state; **no** `permission_basis` field that could grant anything.
3. **`professional_invitations` — the invitation ledger.** inviter, professional, email/phone, `invitation_context` ∈ `agent_lender_org_connection | homeowner_lender_home_team | agent_lender_home_team | lender_agent_network`, related relationship, org, status `created/sent/opened/clicked/claimed/activated/declined/expired/cancelled` + timestamps. One shared invitation service (token signing, expiry, revocation, reminders) with per-context semantics and landing behaviour. Links to the `agent_lender_connections` row when a context produces an org connection.

Active/waiting is **not** on `relationships`. It applies only to eligible lender↔homeowner relationships and is represented through the existing capacity/profile structures (`capacity.server.ts` + a nullable activation record scoped to that one relationship type), so the graph never becomes the subscription system.

## C. Access rule (non-negotiable)

Agent confirmation creates or strengthens an **assertion** only. It may create a Home Team candidate and trigger an invitation. It never exposes a named homeowner.

```text
BatchData detects -> agent asserts -> professional invited -> professional claims identity
 -> independent access basis exists (homeowner authorization, or the accepted
    existing-relationship process, or another canonical basis)
 -> classifyLenderAccess() returns an authorized level
 -> relationship eligible for the named lender experience
 -> plan capacity decides active vs waiting
```

A mistaken MLO selection therefore exposes nothing.

## D. BatchData is an accelerator, not a dependency (verified)

- `normalized->mortgage->>'lender'` present on **57 of 206** stored records, **50 distinct institutions**, noisy (one row is an insurance-bond company). Source fields: `lenderName` / `assignedLenderName` on open liens and mortgage history.
- **No individual loan-officer field exists** — no MLO will ever be invented from an institution.
- `property_intel.mortgage` holds raw ATTOM payloads with **zero** normalized lender names, so extraction runs on the normalized result at enrichment time and persists its own output.
- Title/closing evidence: nothing reliable today → always "unknown".
- Every agent flow works with institution evidence, noisy evidence, or none: the agent can associate a professional from their own network to any homeowner without any detection.

## E. Counting vocabulary

Distinguish and label separately, always: **potential** (detected/suggested), **asserted/confirmed**, **eligible** (classifier-authorized), **active**, **waiting**. Copy claims only what the state supports; raw detections are never presented as eligible relationships.

## F. Migrations

1. `professionals` + conservative unique indexes + GRANTs + RLS.
2. `relationships` + indexes (subject/object/type, org+status) + GRANTs + RLS (parties only).
3. `professional_invitations` + GRANTs + RLS (inviter org, invited professional).
4. Small activation record for eligible lender↔homeowner relationships, tied to existing capacity logic.

## G. Entity resolution (conservative)

Auto-link only on: existing verified user/professional link, NMLS/license match, or individually verified email/phone. Name+organization or shared/unverified office contact produces a **reviewable possible duplicate**, never a silent merge.

## H. Screens / components

`batchdata-normalize.ts` (`buildHomeTeamCandidates()`, pure, institution-only), enrichment writers, new `professionals.ts`/`.server.ts`, `relationships.ts`/`.server.ts`, `invitations.ts` service, `home-team.ts`, agent "Complete Your Client Network" + fast Bulk Relationship Review + My Professional Network in `agent/network.tsx`, invitation emails/landing, free claimed-lender aggregate view, paid activation active/waiting UI, homeowner validator card on `dashboard.tsx`, admin growth funnel + Network Reproduction Rate.

## I. Tests

Provenance/status rules; conservative resolution (no duplicate John Smith, possible-duplicate review, multi-agent invites); candidate extraction (institution only, never an MLO, prefers unknown); actual-lender vs mortgage-resource divergence; invitation lifecycle + cancellation per context; **wrong-John security test — Jennifer misidentifies John, John claims the invitation, and John still sees nothing named until `classifyLenderAccess()` independently authorizes**; free profile shows counts only; 200 eligible vs smaller capacity → capacity only, payment grants no permission; upgrade activates waiting; lender→agent invite leaves agent entitlement SuCasa-funded; revoked consent removes access; existing lender-access/capacity/narrative suites pass.

## Staging

**Stage 1 (next):** relationship/evidence graph, conservative professional identity resolution, BatchData candidate extraction.
**Stage 2:** Agent Professional Network, Bulk Relationship Review, actual-lender vs resource distinction, agent→lender Home Team invitations, access-safe homeowner validation.
**Stage 3:** free claiming, independent access validation, paid active/waiting capacity, lender→existing-agent expansion, growth analytics on `compliance_audit_events`.
Closing Partner: architecture-ready, not built.
