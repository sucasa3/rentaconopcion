# SuCasa Organic Growth Architecture — Audit + Build Plan

## A. What already exists and will be reused (no second source of truth)

| Concern | Canonical today | Decision |
| --- | --- | --- |
| Homeowner record | `lender_portfolio_clients` (+ `home_profiles`, `property_intel`) | Reuse unchanged |
| Homeowner access / 4 permission types | `classifyLenderAccess()` in `src/lib/lender-access.ts` + `consent_records` (`existing_relationship`, `marketing_communication`, `intelligence_access`, `connection_request`) | Reuse as the ONLY access authority |
| Agent↔lender connection + invitations | `agent_lender_connections` (status invited/connected/declined), `invite-token.server.ts` (HMAC, 21-day, revocable), `/agent-invite`, `agent-invite.tsx` email | Reuse and extend; do NOT build a parallel invite path |
| Organizations & membership | `lender_orgs` (`org_type` agent/lender), `lender_members`, `is_lender_member` / `is_lender_manager` | Reuse |
| Plans / capacity / Stripe | `plan_tiers` (`profile_allowance`, `stripe_price_id`), `lender_orgs.profile_allowance`, `capacity.server.ts` / `profile-pool.ts` | Reuse; capacity always read from config, never hardcoded |
| Agent entitlement | `agent_base_entitlements` + `entitlements.ts` (`assertAgentEntitlementSource`) | Reuse; lender payment can never fund it |
| Lender Today / My Book | `lender-workspace.server.ts`, `lender-daily.ts` | Reuse; only add an "active vs waiting" filter |
| Property enrichment | `enrichment.server.ts`, `provider-primary.server.ts`, `batchdata-normalize.ts` | Extend with candidate extraction only |
| Consent revocation | `consent_records.revoked_at` + guard trigger | Reuse |

## B. New canonical models actually required (5 tables, minimal)

1. **`professionals`** — one identity per real person/firm: role(s), name, org, normalized email/phone, NMLS/license, claim + verification status, `user_id`, `org_id`. Entity resolution order: user id → normalized email → normalized phone → NMLS/license → name+organization. `pros` is the *service-professional/vendor* table and stays separate.
2. **`relationships`** — the graph: `relationship_type`, subject/object (typed refs), `org_id`, `source`, `source_record`, `status`, `confidence`, `evidence` jsonb, `confirmed_by`, `confirmed_at`, `permission_basis`, `visibility`, `activation_state` (`active`/`waiting`/`inactive`), timestamps, `revoked_at`. Statuses: detected, suggested, confirmed, invited, claimed, verified, connected, rejected, revoked. Provenance enum: agent_import, agent_confirmation, homeowner_confirmation, professional_import, batchdata_property, batchdata_mortgage, closing_partner_import, sucasa_admin, future_integration.
3. **`professional_invitations`** — one ledger: inviter, professional, email/phone, relationship, org, status (created/sent/opened/clicked/claimed/activated/declined/expired/cancelled) with timestamps. Links to the existing `agent_lender_connections` row when the invite produces an org connection.
4. **`network_events`** — append-only growth analytics events (actor, org, event_key, cohort/source attribution, context).
5. **No new table** for the agent's professional network or Home Team: both are `relationships` rows.

The graph is descriptive. Access continues to be decided by `classifyLenderAccess()` + `consent_records` only.

## C. Conflicts found (must be honoured, not duplicated)

- `agent_lender_connections` already is an agent↔lender-org edge with its own invite lifecycle. The graph will **reference** it, not replace it; org-to-org connection status stays there.
- `lender_portfolio_clients.archived_at` means "quiet, doesn't count against capacity". "Waiting" is a different concept and goes on the relationship edge — reusing `archived_at` would corrupt capacity accounting.
- `sponsored_agent_seats` / `sponsored_profiles` exist and use "sponsored" language. Lender→agent expansion will use the connection path and new neutral copy; no sponsorship, no capacity transfer.
- `lender_member_profiles` is for members of an existing paid org; the free claimed identity lives on `professionals` and is promoted, not duplicated.
- A homeowner's **actual lender** (creates `professional_homeowner_lender`, may support an existing-relationship basis after confirmation) is strictly separate from an agent's **mortgage resource** (`agent_professional_resource`, grants nothing).

## D. BatchData / property fields actually available today (verified)

- `batchdata_test_results.normalized->mortgage->>'lender'` is populated on **57 of 206** stored records, **50 distinct institutions** (e.g. MOVEMENT MORTGAGE, PNC BANK, UNITED WHOLESALE MORTGAGE) and is noisy (one row is an insurance-bond company). Institution names come from `lenderName` / `assignedLenderName` on open liens and mortgage history.
- **No individual loan-officer field exists.** No MLO will ever be invented from an institution.
- `property_intel.mortgage` currently stores raw ATTOM payloads (`property[].mortgage.lender.lastname`), sparsely populated, and holds **zero** normalized lender names — so candidate extraction must run on the normalized BatchData result during enrichment and persist its own output.
- Title/attorney/closing evidence: nothing reliable in the stored payloads today → always "unknown".

## E. Proposed migrations

1. `professionals` + normalized-contact unique indexes + GRANTs + RLS (self/org read, admin manage).
2. `relationships` + indexes on (subject, object, type), (org_id, status), (activation_state) + GRANTs + RLS (parties only).
3. `professional_invitations` + GRANTs + RLS (inviter org and invited professional).
4. `network_events` + GRANTs + RLS (admin read; service-role write).
5. `home_team_candidates` persisted as `relationships` rows with `status='detected'` — no separate table.

## F. Screens / components to modify

- `src/lib/batchdata-normalize.ts` → add `buildHomeTeamCandidates()` (pure, evidence-only, institution-only).
- `src/lib/enrichment.server.ts` / `provider-primary.server.ts` → write detected candidates.
- New: `src/lib/professionals.ts` + `.server.ts` (entity resolution), `src/lib/relationships.ts` + `.server.ts`, `src/lib/home-team.ts`, `src/lib/growth-analytics.server.ts`.
- Agent: new "Complete Your Client Network" grouped review + fast Bulk Relationship Review (seconds per row, never silent confirmation), `My Professional Network` inside `routes/_authenticated/agent/network.tsx`.
- Invitations: extend `email-templates/agent-invite.tsx` + `invite-token.server.ts`; reuse `/agent-invite` landing for professional claiming.
- Free claimed lender: aggregate-only network view (counts + connected agent names, zero homeowner detail) plus value-preview and "Activate My Lender Account" CTA.
- Paid activation: active/waiting split, recommended activation order (homeowner-confirmed → verified existing → agent-confirmed → remaining; never by loan value), approaching-capacity and waiting/upgrade messaging.
- Homeowner: validator-only Home Team card on `dashboard.tsx` (Yes / Change / Not sure), optional.
- Admin: growth funnel + Network Reproduction Rate.

## G. Tests

`relationships`/provenance rules, entity resolution (no duplicate John Smith, multi-agent invites), candidate extraction (institution only, never an MLO, prefers unknown), actual-lender vs mortgage-resource divergence, invitation lifecycle + cancellation, free profile shows counts but no homeowner detail, 200 eligible vs smaller capacity → only capacity active and payment grants no permission, upgrade activates waiting rows, lender→agent invite leaves agent entitlement SuCasa-funded, revoked consent removes access, existing `lender-access.test.ts` / capacity / narrative suites still pass.

## Build order

1. Relationship graph + provenance 2. Professional identity + resolution 3. Candidate extraction 4. Agent Professional Network 5. Bulk Relationship Review 6. Agent→lender invitations 7. Free claiming 8. Paid activation (active/waiting) 9. Lender→agent expansion 10. Growth analytics. Closing Partner is architecture-ready only, not built.

Because this is large, I will deliver it in three reviewable stages: (1–3) graph, identity and detection; (4–6) agent review and invitations; (7–10) claiming, activation and analytics.
