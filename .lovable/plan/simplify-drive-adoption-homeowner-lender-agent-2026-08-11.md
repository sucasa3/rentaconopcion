# Simplify + drive adoption: homeowner, lender, agent

The product is feature-rich but each surface now asks the user to understand a lot at once. The homeowner dashboard stacks 9 panels; the agent portfolio is a single 1,500-line page with many scores and tabs; lender and agent both have separate portfolio, campaigns and network pages that overlap. The theme of this plan: **one obvious next action per screen, everything else one tap away.**

## 1. Homeowner — lead with the single next action

Today the dashboard renders value, equity, home care, seller intent, assistant, requests, documents, inspection findings, recommended pros and the report — all at full weight. New users don't know where to start, and returning users have no reason to come back weekly.

- **"Your next step" hero card at the top**: one card that picks the single highest-value action right now (finish profile → upload inspection → overdue system → refi signal → request a quote) with one primary button. Everything below becomes supporting detail.
- **Collapse the lower half into three tabs** — Home, Care, Documents — instead of a long scroll. Value/equity/next step stay always-visible above the tabs.
- **Progress meter for profile completeness** ("Your home profile is 60% complete — add your HVAC age to sharpen recommendations"). Ties directly to Home Score, which we already compute.
- **Seller intent card moves below the fold** and only appears once there is real equity to talk about — it currently competes with maintenance for attention.

## 2. Lender — one screen, one job

MLOs land in their book already, but campaigns, network, introductions, sponsorships and proposals are spread across tabs and separate routes.

- **Merge `/lender/network` into the portfolio tab bar** so there is one URL per MLO with tabs: Clients, Campaigns, Network, Import. No more two competing "homes".
- **Daily action list at the top of Clients**: "5 clients to call today" derived from existing opportunity scores, with call/intro/campaign buttons inline. Right now the MLO must sort and interpret a table themselves.
- **Empty-state onboarding**: a 3-step checklist (import clients → turn on a campaign → connect an agent) shown until each step is done. This is the biggest lever on first-week retention.

## 3. Agent — reduce score overload

The portfolio shows Intent, Readiness, Net proceeds, bands, engagement and four activity tabs. Each is defensible; together they are heavy.

- **Lead with one number per client** (combined intent) and move Readiness and Net proceeds into the client drawer, where the agent is already in decision mode.
- **"Today" strip above the table**: high-intent clients + recommendations due, as tappable cards — the same daily-action pattern as the lender.
- **Split the 1,500-line route** into `PortfolioSummary`, `ClientTable`, `ClientActivityFeed` and `ClientDrawer` components so the page loads and maintains cleanly.

## 4. Shared adoption mechanics

- **Consistent mobile bottom nav** for each role (homeowner: Home / Care / Requests / Profile; lender + agent: Book / Campaigns / Network). The app is mobile-first but currently navigates via desktop-style tab rows.
- **Email/nudge hooks** already exist through campaigns — wire the homeowner "next step" and the lender/agent "today" lists into a weekly digest so the app has a reason to be reopened.
- **First-run tour re-enabled as opt-in per role** (it is globally paused today), triggered only from a "Take the tour" button in the header.

## Suggested order

1. Homeowner next-step hero + tabs (biggest adoption lever, smallest change)
2. Lender single-screen merge + daily action list
3. Agent "Today" strip + score simplification
4. Mobile bottom nav
5. Route splitting / cleanup

## Technical notes

- Next-step selection is a pure function over data already loaded on the dashboard (`home-score.ts`, `maintenance-rules.ts`, inspection findings, refi signal) — no new tables.
- Lender merge is a routing change: fold `lender/network.tsx` content into a `portfolio.$id.network.tsx` child route and redirect the old path.
- Daily action lists reuse `homeowner_opportunities` and the existing agent feed; no new server functions beyond a small `limit`/ordering change.
- Onboarding checklists derive from existing counts (clients imported, active campaign activations, accepted connections) — no schema change.
