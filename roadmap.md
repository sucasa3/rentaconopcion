# Roadmap

## Agent + Lender homeowner detail redesign (published 2026-09-19)
- [x] Reorder both detail views to Home → Opportunity → Why now → Intelligence → Conversation → Actions → Details
- [x] Anchor compact professional property identity in the SuCasa Home Profile system; avoid generic lead-detail labels and unsupported shared claims
- [x] Keep Agent listing/prep intelligence and Lender finance/review intelligence genuinely role-specific
- [x] Preserve grounded facts, canonical calculations, access classification, and channel permissions
- [x] Verify code, tests, and existing flow behavior; deliver through the preview link before publication

## Agent Today daily-priority refinement (preview ready 2026-09-19)
- [x] Compact Daily Intelligence and move Start here higher on mobile
- [x] Make the first relationship the clear priority without changing ranking or canonical copy
- [x] Preserve server-authoritative channels while clarifying the recommended outreach action
- [x] Collapse outcome logging behind one compact disclosure with unchanged values
- [x] Make Next relationships a denser queue and align styling with View homeowner
- [x] Verify populated and first-run states across mobile and desktop; preserve shared quiet and unavailable-channel render paths
- [x] Present in preview for approval before publication

## Homeowner hero intelligence strip (approved)
- [x] Translucent navy glass strip over the lower edge of the property photo
- [x] Estimated Value, Estimated Equity, Home Score from canonical data only
- [x] Verify 320/390/430px + desktop, address never covered

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

## Homeowner final visual refinement (2026-09-15)
- [x] Combine Home Score and evidence-backed systems into one Home Health section
- [x] Remove the repeated Value & Equity summary below the hero
- [x] Keep Home Care and Home Team compact with distinct semantic surfaces
- [x] Reduce mobile navigation to Home, Value, Care, Team, and More
- [x] Move Setup Guide from the Home dashboard into More without removing destinations
- [x] Verify 320/375/390/430px, desktop, navigation, focus, reduced motion, and console

## Homeowner reference-rich visual treatment (2026-09-15)
- [x] Restyle the hero intelligence strip as light frosted glass with canonical metrics
- [x] Give Home Health evidence-backed system tiles and stronger visual hierarchy
- [x] Enrich Home Care, Home Team, Ask SuCasa, and bottom navigation without changing behavior
- [x] Verify and present the finished 390px mobile view before further structural changes

## Homeowner reference-fidelity correction (2026-09-15)
- [x] Strengthen the existing photo hero and light intelligence strip without fabricated data
- [x] Compact the incomplete-address prompt so it does not overpower the dashboard
- [x] Increase visual richness in Home Health, Home Care, Home Team, Ask SuCasa, and mobile navigation
- [x] Verify reference fidelity at 390px plus 320/375/430px and desktop

## Homeowner vibrant color refinement (2026-09-15)
- [x] Strengthen homeowner-scoped navy, blue, orange, green, amber, and red accents
- [x] Replace washed-out score, care, team, address, and assistant accents without changing structure
- [x] Verify 320/375/390/430px and desktop for contrast, overflow, and legibility

## Homeowner no-pastel visual correction (2026-09-15)
- [x] Apply the approved exact white, navy, blue, orange, green, amber, red, and text colors
- [x] Remove pastel fills from Home Health, system tiles, Home Care, Home Team, and address prompt
- [x] Keep color concentrated in icons, rings, statuses, borders, tabs, navigation, and CTAs
- [x] Verify mobile and desktop contrast, overflow, canonical status color, and console behavior

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


## Home Health tiles link to focused Home Care (2026-09-16)
- [x] Each Home Health system tile is a single tap target linking to /home-care?system=<key>
- [x] Home Care validates ?system= and expands, scrolls to and flashes the focused system
- [x] Focused system with evidence shows "Why SuCasa flagged this" reason first, then Update information / Request service
- [x] Focused system without evidence shows a system-specific prompt (Add <system> details / Request service), never a generic empty state
- [x] Home Score keeps the existing "What affects this?" explainer (not routed to Home Care)
- [x] Normal Back behavior preserved; bilingual copy added

## "My home" rename + Add system details dialog (2026-09-16)
- [x] Public header and footer "Dashboard" renamed to "My home"
- [x] "Add <system> details" opens the existing details dialog instead of onboarding
- [x] Year must be explicitly confirmed before saving (no current-year inference)
- [x] Synthetic system item is presentation-only; nothing persisted until save
- [x] Cancel leaves no record; save invalidates component-service-log (Home Care + Home Health)
- [x] Request service unchanged

## One Home Care page + recurring-task guidance (2026-09-16)
- [x] Merge current To Do care and future Home Plan horizons into `/home-care`
- [x] Redirect `/home-plan` to the merged Home Care page
- [x] Preserve cost ranges, request actions, and done/dismiss state
- [x] Add bilingual “How to handle this” guidance to supported recurring tasks
- [x] Keep recurring-task completion separate from opening guidance

## Public agent conversion experience (2026-09-16)
- [x] Build product-led `/agents` landing page with authentic illustrative Agent Today proof
- [x] Preserve the complete noindex presentation at `/agents/deck`
- [x] Add role-specific public agent signup using existing profiles and idempotent workspace activation
- [x] Route agent pricing actions into the agent-specific signup flow
- [x] Preserve `/agents/deck` ahead of legacy deep-agent IDX redirects
- [x] Add first-party, PII-safe, non-blocking funnel milestones and attribution
- [x] Verify free capacity only; no access, connection, sponsorship, paid, consent, or permission side effects
- [x] Verify mobile, desktop, accessibility, metadata, routes, deck, signup, tests, and console

## Public lender conversion experience (2026-09-16)
- [x] Build public `/lenders` landing page (index,follow) in the `/agents` design language
- [x] Preserve the full presentation at `/lenders/deck`, noindex, with print/PDF and keyboard nav
- [x] Primary CTA "Talk to us about a pilot"; secondary presentation; sign-in for existing officers
- [x] Trust section states: relationship stays with agent, upload is not consent, no automatic lender access
- [x] All demo homeowners, values, equity and mortgage details labeled illustrative/fictional
- [x] Add PII-free lender funnel events; exempt `/lenders*` from legacy IDX redirects
- [ ] PRODUCT DECISION: does one physical property consume a profile slot in every workspace that holds it, or count once globally? (currently per-organization)
- [ ] FUTURE: homeowner-confirmed agent relationship resolution when two agents assert the same homeowner

## SuCasa Daily Read email — Agents + Lenders (approved with adjustments 2026-09-17)
- [x] Reuse canonical agent action queue and gated lender workspace; no second engine
- [x] Stable signal fingerprint (homeowner + canonical opportunity + canonical reason + urgency); NEW is never "not emailed for N days"
- [x] Granular signal history (`daily_read_signals`), so a new opportunity for a previously surfaced homeowner still counts as new
- [x] Send ledger unique per (user, org, audience, send_date)
- [x] Three states + 3-day quiet-day cooldown + same-set suppression
- [x] Role-correct copy; no lender vocabulary in agent emails; lender gated by access classifier and fact scopes
- [x] Timezone-aware morning delivery via one hourly tick (recipient local 7am, DST-safe)
- [x] Professional Daily Read on/off preference with captured browser timezone
- [x] Open / CTA-click tracking on the send record; PII-free funnel events
- [x] Tests (25 new, 276 total), dry run across all agent + lender accounts, one agent + one lender email to Neil, 390px render check
- [ ] AWAITING GO-AHEAD: schedule the hourly production cron (`/api/public/daily-read/tick`) — deliberately not scheduled yet

## Home Team v2 (future — not part of the current release)
- [ ] Reconcile an authenticated homeowner with the correct portfolio-client record conservatively
- [ ] Create agent relationships without granting access or exposing another professional's workspace
- [ ] Create lender relationships without granting access or exposing another professional's workspace
- [ ] Let the homeowner confirm or reject relationship truth
- [ ] Keep private homeowner data behind explicit, scope-based consent
- [ ] Support revocation and disconnection without erasing relationship evidence

## Agent + Lender public conversion redesign (approved 2026-09-17)
- [x] Shorten `/agents` and `/lenders` to product preview, four-answer value, trust, conversion, and low-priority resources
- [x] Add dedicated `/agents/pricing` and `/lenders/pricing` pages with role-correct conversion paths
- [x] Replace mixed `/pricing` with an Agent/Lender role gateway
- [x] Preserve direct free CTAs, attribution, decks, pilot inquiry, signup, Discovery, billing, permissions, and private workspaces
- [x] Verify canonical lender commercial offer and make the $447 pilot → $149/month path unambiguous
- [x] Verify mobile first viewport, desktop, accessibility, routes, deck/print, CTA behavior, console, and regression tests
- [x] Final refinement: keep each landing page to Hero/Product Proof → four-answer flow → concise trust → final CTA → footer, with no added marketing sections

## Spanish public pages + critical emails (done)

## Lender → Agent Introductions hardening (complete)
- [ ] Aggregate-only lender opportunity view (k=5, no geography/bands/deltas/timestamps)
- [ ] `introductions` lifecycle table: lender_requested → agent_offered/declined → homeowner_accepted/declined → connection_active → permission_revoked
- [ ] Per-channel homeowner consent grants + internal `introduction_consent_events` ledger
- [ ] Public token consent page (no account required) + in-app path for linked homeowners
- [ ] Minimized lender reveal (name + authorized channels only), channel-scoped revocation/suppression
- [ ] Economic guardrail tests (no agent or lender benefit from introduction activity)
- [ ] Freeze legacy approved introduction_requests rows (no consent backfill)

## Public homepage — one home, connected action (in progress 2026-09-19)
- [x] Replace the current long homepage with the HOME → CHANGE → INTELLIGENCE → ACTION story
- [x] Make the fictional Home Profile the visual anchor with connected Agent Today and Lender Today outcomes
- [x] Preserve one restrained connected-services visual without reintroducing Home Team behavior
- [x] Keep every homepage string complete in English and Spanish
- [x] Verify phone, desktop, focus, contrast, reduced motion, routes, translations, tests, and preview-only delivery
- [x] Refine the approved mockup to one product demonstration and one homeowner-first role section
- [x] Tighten mobile rhythm and relabel the center service as Mortgage & equity

## Public homepage — homeowner product journey refinement (approved 2026-09-19)
- [x] Replace the three-role hero visual with one substantial fictional My Home showcase
- [x] Connect the fictional HVAC care need to 2–3 fictional provider cards
- [x] Follow with compact, distinct Agent Today and Lender Today benefit sections
- [x] Remove repeated how-it-works, role-selection, and service-category sections
- [x] Keep EN/ES complete and verify the full mobile preview, desktop, routes, accessibility, tests, and preview-only status
- [x] Compact the HVAC provider handoff into one Recommended professionals-style surface
- [x] Keep fictional providers non-actionable while preserving legitimate Browse services navigation
- [x] Re-verify the complete mobile sequence and preview-only delivery
- [x] Replace fictional provider recommendations with the existing Home Services category-card treatment
- [x] Put HVAC first and preserve existing response-time labels, service routes, and EN/ES content
- [x] Verify the full mobile sequence and keep the revision preview-only

## Public homepage — action layer and isolated professional teasers (complete 2026-09-19)
- [x] Preserve eight Home Services category cards, connect HVAC to the fictional need, and remove unsupported homepage response times
- [x] Add the approved action-layer headline, supporting copy, partner disclosure, request routes, and Browse all services link in EN/ES
- [x] Build compact isolated static Agent and Lender public demo components for homepage use only
- [x] Simplify professional sections to benefit → product teaser → large blue CTA while keeping homeowner content dominant
- [x] Keep `/agents` and `/lenders` unchanged and verify 390px/1280px, routes, accessibility, console, types, and tests
- [x] Keep the revision preview-only and do not publish

## Public homepage — visual polish pass (complete 2026-09-19)
- [x] Reduce Home Services headline scale on mobile only (smaller size + tighter line-height)
- [x] Compress Agent and Lender previews ~20-25% vertically while preserving all core information
- [x] Simplify professional-section intro to "For agents & lenders / Better context. Better-timed conversations." in EN/ES
- [x] Verify 390px/1280px, EN/ES fictional labels, routes, types, tests, and no regressions
- [x] Keep `/agents` and `/lenders` unchanged
- [x] Keep preview-only, do not publish

## Public homepage — My Home demo hero score alignment (complete 2026-09-19)
- [x] Replace only the public hero tray’s plain score treatment with the green circular score ring showing 82
- [x] Preserve the public demo width, image crop, spacing, fictional data, translations, and downstream layout
- [x] Keep authenticated dashboard components and logic isolated and unchanged
- [x] Verify 390px/1280px, EN/ES, overflow, accessibility, console, types, tests, and preview-only delivery

## Public homepage — mobile opening refinement (complete 2026-09-19)
- [x] On mobile, keep the hero promise and move directly into the complete fictional My Home demo
- [x] Hide the secondary subhead, hero buttons, and My Home section intro on mobile only
- [x] Place the primary Start free CTA immediately after the My Home demo on mobile only
- [x] Preserve the My Home → Home Services handoff and all existing service-category behavior
- [x] Keep desktop hierarchy unchanged except minor spacing
- [x] Verify 390px/1280px, EN/ES, routes, console, types, tests, and preview-only delivery

## Public homepage — My Home product-palette parity (complete 2026-09-19)
- [x] Scope the isolated fictional My Home showcase to the authenticated homeowner palette tokens
- [x] Match Home Health, Home Score, Home Care, Documents, History, and Ask SuCasa presentation without sharing authenticated logic
- [x] Verify 390px/1280px in EN/ES, no surrounding homepage changes, console errors, overflow, type, or test regressions
- [x] Keep preview-only and do not publish

## Lender Today — daily command center refinement (preview ready 2026-09-20)
- [x] Compact Daily Read band with three inline totals and a quiet "Why these N?" disclosure
- [x] Start here as the focal white/warm card: name, canonical reason, ≤3 supporting facts, Why now, Recommended next step, intelligence-blue opener
- [x] Recommended permitted channel primary, others secondary, blocked channels keep their existing reasons
- [x] Compact "Log outcome" disclosure with the same existing lender outcome values and behavior
- [x] Dense secondary queue rows (rank, name, reason, strongest fact, channel, View homeowner)
- [x] Homeowner-requested connections keep precedence and authorization disclosure
- [x] Compact "SuCasa working for you" aggregate with the sponsored-only note unchanged
- [x] Scoped to the approved professional-detail system; IntelligenceSurface and ChannelActions reused unmodified
- [x] Typecheck + 321 tests pass; verified at 320/390/430px and desktop with no horizontal overflow
- [ ] Publish after visual review and explicit approval

## Dependency security remediation (preview, 2026-09-20)
- [x] Stage 1: removed @react-three/drei and @streamdown/mermaid (mermaid plugin unregistered in message.tsx); overrides for browserslist, baseline-browser-mapping, dompurify, mermaid, js-yaml
- [x] Stage 2: vendored SheetJS Community Edition 0.20.3 at src/vendor/xlsx/, removed xlsx@0.18.5 npm dep, new src/lib/spreadsheet-import.ts + 9 tests
- [x] Stage 3: kept direct browserslist/js-yaml entries as intentional resolution anchors; dependency scan reports 0 vulnerabilities in 73 production deps
- [ ] Publish pending explicit approval
- [x] Verified vendored SheetJS CE 0.20.3 byte-identical to official cdn.sheetjs.com tarball; integrity recorded in src/vendor/xlsx/INTEGRITY.md
- [x] Published to sucasa.com 2026-09-20 (release commit 01dbd8b; rollback point = 1e58429, the last pre-remediation production commit)

## Plan lookup fix (2026-09-20)
- Root cause: lender_orgs has two foreign keys to plan_tiers (plan_key, pending_plan_key), so the embedded plan read failed with "more than one relationship was found". This broke the capacity check used by list import, plus the lender dashboard allowance, credits, premium and network seat reads.
- Fix: all five reads now use the explicit hint plan_tiers!lender_orgs_plan_key_fkey. No schema, RLS, ranking, permission or UI change.
- Verified: plan data resolves (MLO / 250 allowance); import now returns the correct capacity message instead of an opaque failure. Demo lender book holds 987 profiles on a 250 plan, so imports there are legitimately blocked by the limit.
- Typecheck clean, 330 tests pass. Not yet published.
