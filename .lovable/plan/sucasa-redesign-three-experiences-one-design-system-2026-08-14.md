# SuCasa redesign: three experiences, one design system

Goal: same backend, dramatically simpler front end. Agents and lenders land in a business command center, homeowners land in a visual home dashboard, and property data stops being pulled just because a screen opened.

## What exists today (verified)

- Roles live in `user_roles`; there is no role-aware landing — the header always points to `/dashboard` (homeowner) and business users must find `/agent` or `/lender` themselves.
- Agent portfolio is one 1,520-line route; lender portfolio is already tabbed (Clients / Campaigns / Import / Network).
- Campaigns exist and work (`campaigns.functions.ts`, `CampaignsWorkspace`) but the agent only reaches them via a small text link.
- Opportunities exist as a real table (`homeowner_opportunities`) with category, strength, score, reasons — currently rendered twice on the agent page (top strip + table rows).
- People live in `lender_portfolio_clients` (used by both lenders and agents). No prospect/invited/activated status, no invite flow.
- Property pulls happen from the UI: `useAutoEnrich` fires on page load, plus visible "Retry pulls", "Enrich", coverage and ATTOM budget panels.

Nothing is rebuilt. Every change below is UI/IA on top of these tables and server functions, plus two additive columns and one refresh service.

## Phase 1 — Role-based entry and navigation

- Add a `useMyRole` hook (reads `user_roles`, cached) and a `/` + post-login resolver: admin -> `/admin`, agent -> `/agent`, lender -> `/lender`, otherwise `/dashboard`.
- `/agent` and `/lender` become **business dashboards**, not portfolio pickers. The existing MLO auto-redirect into a single book is replaced by the dashboard; the book becomes the "Homeowners" tab.
- New shared app shell: desktop left sidebar, mobile bottom tab bar. Agent and lender both get Dashboard · Homeowners · Prospects · Opportunities · Marketing · Activity · Settings. Homeowner gets Home · Care · Requests · Profile.
- The homeowner detail view becomes a drawer/route inside the business shell, never the professional's landing page.

## Phase 2 — iOS-inspired design system

- Extend `src/styles.css` tokens: softer surfaces, 3 accent hues for status (blue = info, green = money/growth, amber = attention), larger radii, subtle elevation.
- New primitives in `src/components/ui-kit/`: `StatCard` (big number + label + trend), `SignalCard` (icon, name, one-line signal, one action), `StatusPill`, `ScoreRing`, `SectionHeader`, `ActionButton`, `EmptyState`.
- Rewrite copy across dashboards: headline + one sentence max. The Home Score paragraph becomes "Improve your Home Score — fix something, update a system." with an Update Home button.

## Phase 3 — Business dashboards

Both agent and lender dashboards, same skeleton, different language:

```text
Good morning, Sam
[ Homeowners 125 ] [ Activated 82 ] [ Opportunities 14 ] [ Campaigns 3 ]

Today                                   [+ Add Homeowner]
 3 people need attention  -> signal cards

Opportunities (single section, no repeats)
 High intent · Value change · Equity · Home improvement · Follow-up

Marketing
 Active campaign cards with sent / opened / not viewed
```

- Opportunities render **once**, from `homeowner_opportunities`, grouped by category with icon + name + signal + recommended action + View homeowner. The duplicate strip on the agent portfolio is deleted.
- Marketing becomes a first-class nav item for agents (route already exists at `/agent/campaigns`, moved into the shell) with campaign cards showing send/open counts from `campaign_sends`.
- Agent portfolio route is split into `PortfolioSummary`, `ClientTable`, `ClientActivityFeed`, `ClientDrawer` — behavior preserved, file size cut.

## Phase 4 — Prospects, clients and Gift SuCasa

Additive migration on `lender_portfolio_clients`:
- `relationship` (`prospect` | `client`), `lifecycle` (`added` | `invited` | `activated`), `invited_at`, `activated_at`, `invite_token`.
- Grants + RLS mirrored from the existing policies on that table; no new tables, so campaigns, opportunities and enrichment keep working untouched.

Flows:
- `+ Add Homeowner` sheet: Add prospect / Add client / Import contacts. Minimal fields (name, email, phone, address optional) reusing `addPortfolioClient` and `ingestPortfolioCsv`.
- **Gift SuCasa**: preview screen listing what the homeowner receives, then Send free invitation. Sends via the existing GHL/campaign sending path, links to `/onboarding?invite=<token>`.
- Activation: the onboarding form claims the token, links `homeowner_id`, and **this is the moment property intelligence is fetched for the first time** — not when the prospect is added.
- Lifecycle pill on every row: Prospect -> Invited -> Activated -> Client.

## Phase 5 — Property intelligence service (cost control)

- New `src/lib/property-intel.server.ts` decision layer: `resolvePropertyIntel(clientOrProperty, { need, priority })`. It checks `property_intel` freshness, `last_intel_refreshed_at`, recent `homeowner_activity_events`, and the monthly budget before any external call, and returns cached data with a freshness stamp otherwise.
- Refresh windows, configurable in one constants block: low priority = never on view; medium = stale beyond N days plus real activity; high = activation, repeated value checks, equity request, explicit user request on an active opportunity.
- Remove `useAutoEnrich` from page mount on both portfolios; remove "Pull records", "Enrich", "Retry pulls", coverage and ATTOM/budget panels from agent and lender UI (they stay in `/admin`). Business users see only "Updated recently" / "Home information updated".
- No provider name appears anywhere in business or homeowner UI.

## Phase 6 — Homeowner dashboard polish

- Hero: big Value, big Equity, ScoreRing for Home Score, one next-step card. Everything else moves into Home / Care / Documents tabs already scaffolded.
- Tasks and recommendations become small visual cards with one action each; paragraphs deleted.

## Phase 7 — Business onboarding

Four-step visual setup for a first-time agent/lender (icon, headline, one sentence, progress dots): Build your network -> Give them SuCasa -> Let SuCasa work for you -> You're ready. Reuses `guided-onboarding.tsx` patterns and persists per user.

## QA checklist

Each role logs in to the right dashboard; agent Marketing is visible; no opportunity appears twice; no Pull/Enrich/provider controls in business UI; opening lists, dashboards and profiles triggers zero external property calls; invite -> activation works end to end; mobile bottom nav on all three roles.

## Suggested build order

Phases 1-3 first (biggest perceived change, no schema work), then 4, then 5, then 6-7.

## Open question

Invitations: send through the existing GHL pipeline that campaigns already use, or as a direct transactional email from SuCasa? Defaulting to GHL unless you say otherwise.
