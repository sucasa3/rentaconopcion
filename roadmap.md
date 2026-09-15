# Roadmap

## Homeowner hero intelligence strip (approved)
- [ ] Translucent navy glass strip over the lower edge of the property photo
- [ ] Estimated Value, Estimated Equity, Home Score from canonical data only
- [ ] Verify 320/375/390/430px + desktop, address never covered

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

## Homeowner Home Profile premium redesign (approved 2026-09-15)
- [x] Preserve the property-photo hero as the dominant first impression
- [x] Make Home Score explainable and separate missing records from physical concerns
- [x] Show only evidence-backed system statuses; keep Water Heater distinct from Plumbing
- [x] Use canonical dates for value, equity, score, and system freshness
- [x] Consolidate money, care, team, and Ask SuCasa into the approved mobile hierarchy
- [x] Verify and present the actual 390px and desktop views

## Homeowner Home Profile light refinement + Home Team (2026-09-15)
- [x] Replace the dashboard-only near-black premium tokens with a warm premium light SuCasa treatment
- [x] Refine Score, Systems, Value & Equity, Home Care, and Ask SuCasa with existing semantic colors
- [x] Add one permission-neutral canonical Home Team read for confirmed/current agent and lender plus pending states
- [x] Show confirmed, one-professional, pending, and empty Home Team states without fabricating records
- [x] Verify 320/375/390/430 mobile, desktop, Dashboard → Home Care, and Dashboard → Money
- [x] Confirm relationship display does not change consent or professional access

## Homeowner approved-reference visual refinement (2026-09-15)
- [x] Apply the exact approved homeowner palette through dashboard-scoped semantic tokens (#F6F7F9 page, #FFFFFF cards, #EEF1F4 secondary, #F5F1EC care, #182230 text, #17324D deep navy, #214F7B action navy, #DA5431 orange, #2F7D67 positive, #B9822C attention, #B94A48 risk, #E8EFF6 intelligence, #4478A5 intelligence accent, #DDE2E7 borders, #E3EBF4 avatars)
- [x] Tighten 390px density while preserving the photo-first hierarchy and 44px actions
- [x] Refine Score, Systems, Value & Equity, Home Care, Home Team, and Ask SuCasa presentation only; keep white/neutral surfaces dominant
- [x] Make Home Team professionals visually primary with compact white cards, blue-gray avatars, navy initials, muted role labels, and a secondary manage action
- [x] Verify confirmed, one-professional, pending, and empty Home Team presentation states
- [x] Capture 390px and desktop views; verify Home Care and Money transitions

## Homeowner compact reference match (2026-09-15)
- [x] Tighten the photo, score, systems, money, care, team, and Ask SuCasa composition without changing behavior
- [x] Preserve narrow-screen resilience, 44px controls, canonical states, and the existing SuCasa logo
- [x] Verify 320/375/390/430px, desktop, Home Team variants, and Home Care/Money transitions

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

## Stage 2 Slice 2 — professional invitations + homeowner validation (approved)
- [ ] Harden invite token: require INVITE_TOKEN_SECRET, no service-role/Lovable fallback; typed token; legacy agent wrappers kept
- [ ] `professional_invitations` canonical ledger; one active invitation per inviter org + professional + context
- [ ] Server-mediated public landing (no homeowner/property/mortgage data)
- [ ] Claim requires authenticated + verified matching email; idempotent; reconciliation, never silent merge
- [ ] Claim verifies email only (not phone/NMLS/license/org)
- [ ] Homeowner validation: Step A relationship truth, Step B separate optional consent
- [ ] classifyLenderAccess() stays the only access authority; no home_team shortcut
- [ ] Invitation events in compliance_audit_events; no homeowner PII
- [ ] Tests A–H

## Final smoke test — Professional Network invitations (2026-09-14)
- [x] Test lender records in SuCasa Demo Realty (one with email, one without)
- [x] Invite → "Invitation sent"; no-email lender non-invitable with hint
- [x] Token/link failure cases: withdrawn, expired, malformed, too short, tampered
- [ ] (pending user) Correct verified email claims → "On SuCasa"
- [x] Wrong account cannot claim; correct verified email can claim → "On SuCasa"
- [x] Resend and Withdraw verified separately
- [x] Claim grants no homeowner permission, capacity, agent benefit or paid entitlement
- [x] Confirm claimed profile / confirmed relationship edge does NOT make the homeowner named or actionable for the lender (classifyLenderAccess remains the only authority)

## Domain migration — sucasa.com platform + homes.sucasa.com IDX (approved 2026-09-14, no DNS changes yet)
- [x] Single source of truth for link bases (`src/lib/site-urls.ts`); Browse Homes + invitation links read from it
- [x] Complete Lofty sitemap + URL-family inventory (1,087 URLs, pulled 2026-09-14 past the firewall challenge)
- [x] Confirm `/agents`: Lofty uses only `/agents/<team>/<id>`; bare `/agents` is free for us
- [x] Confirm city/market structure: nested `/neighborhoods/<id>/<city>` (8), neighborhoods `/neighborhood/<id>/<slug>` (1,006)
- [x] Draft old-URL -> homes.sucasa.com redirect map, query strings preserved (both hosts: www is today's canonical)
- [x] Keep/rebuild/retire classification for the 51 flat marketing pages (approved 2026-09-14 with adjustments)
- [x] Blog decision: `/blog/*` moves to sucasa.com/blog/*, exact slugs, 301 from www
- [ ] Same-path rule: rebuilt pages keep their existing slugs (no renaming of Spanish education URLs)
- [ ] Value check on the 9 retire candidates before any 410 (search data / backlinks / campaign refs); redirect instead of 410 where value exists
- [ ] Review the 5 single-property pages individually (keep on IDX vs retire/redirect)
- [ ] VERIFY /documentos (public content or client area?) before implementation
- [ ] VERIFY /atlantaflips (still has inventory?) before implementation
- [ ] Build /blog + /blog/$slug on the platform: exact slugs, title, meta description, canonical, published date, structured data
- [ ] BLOCKED: blog post content cannot be fetched (firewall blocks all page HTML) — needs an export or copy from Lofty
- [ ] (needs Lofty) Confirm homes.sucasa.com can be provisioned with identical IDX paths

- [ ] Stand up + fully test homes.sucasa.com before touching sucasa.com
- [ ] Canonical URLs on IDX pages -> homes.sucasa.com versions, before any redirect
- [ ] Flip IDX_BASE_URL to https://homes.sucasa.com once that host is live
- [ ] Connect sucasa.com (primary) + www.sucasa.com redirect to this project — last step
- [ ] Flip PLATFORM_BASE_URL / set PUBLIC_SITE_URL to https://sucasa.com after connection
- [ ] Real sitemap for the new app (current one lists only 3 URLs)

