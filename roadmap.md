# Roadmap

## SuCasa Agent Experience: Invitation → Activation → Daily Operating System (approved)

- [x] Email brand redesign (real logo, warm/light, navy accents) + QA notes
- [x] Premium agent invitation email
- [x] Signed, expiring invitation token + public preview endpoint (minimum-safe fields)
- [x] Public invitation landing page `/agent-invite`
- [x] Agent workspace provisioning (org + owner + book + lender connection), idempotent
- [x] Agent Today command center (Best Move → Next up → Who to contact today)
- [x] Adaptive first run: real homeowner aha / empty state / preparing state
- [x] Outcome logging advances the queue (Apple-style state changes)
- [ ] "Home Profiles Activated" label + microcopy
- [x] Keep Tasks and Opportunities workspaces intact (no redirects)
- [x] QA: full journey + mobile + email clients

- [x] Agent contact channels: server-authoritative Call/Text/Email eligibility (shared contact-channels model, role-specific policy)

## Agent Daily Intelligence (Today)
- [x] Additive recentOutcomes field on action queue
- [x] agent-daily helpers: daily read, handled-today, service phrasing
- [x] Rebuild agent-today.tsx hierarchy (no duplicate homeowners, next 5 + link)
- [x] Label opportunities accurately (Opportunities developing)
- [x] Tests + typecheck

## Homeowner Home Intelligence (Home Today)
- [x] home-today.ts pure helpers + tests (what SuCasa sees, recent updates, health, invitations)
- [x] Rebuild /dashboard hierarchy (hero anchor, one coming-up card, quiet rows)
- [x] Recent updates only from real timestamps (docs, findings, value snapshots)
- [x] "What are you thinking about?" navigation-only, no intent capture
- [x] No new Premium query on dashboard
- [x] Reframe wording: home vault, home's story, ask SuCasa, home health

## Homeowner mobile visual correction
- [x] Compact greeting keeps HomeHero in the first mobile viewport
- [x] Move setup/request actions out of the mobile greeting
- [x] Remove repeated financial card, large health card, and thinking chips
- [x] Compact What SuCasa sees and preserve one primary Coming Up card
- [x] Group secondary destinations into Your Home Profile rows
- [x] Verify 393×526 mobile fold, desktop layout, tests, and runtime console

## Network Stage 2 (next)
- [ ] Agent Professional Network (people the agent works with, independent of provider data)
- [ ] Bulk Relationship Review over home_team_candidates
- [ ] Actual lender vs mortgage-resource distinction
- [ ] Agent to lender Home Team invitations (reuse invitation service, new context type)
- [ ] Access-safe homeowner validation flow (classifyLenderAccess remains the only authority)

### Stage 2 Slice 1 guardrails (approved 2026-09-12)
- [x] Reposition /agent/network as Professional Network (My people + Complete Home Teams); no sponsorship/credit basis
- [x] Skip = no state change; unknown = reviewed; no_lender never auto-rejects provider evidence
- [x] Homeowner-confirmed lender is immutable by agents, excluded from bulk
- [x] Workspace-scoped agent_professional_resource + workspace-scoped contact provenance
- [x] Explicit server-side org/portfolio-client authorization; idempotent bulk with per-client outcomes
