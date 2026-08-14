# Finish the iOS-style redesign across every experience

## Where things stand

Already redesigned with the new app chrome (sidebar on desktop, bottom tab bar on mobile) and the card ui-kit:
- Lender home and Lender opportunities
- Agent home and Agent opportunities
- Lender and agent portfolio lists (tables become stacked cards below `md`)

Still on the old marketing header + long scrolling page layout:
- Homeowner dashboard
- Lender portfolio (Clients / Campaigns / Import / Agent network)
- Agent portfolio
- Lender campaigns, Lender network, Agent campaigns, Agent network
- Service request detail

## What changes

### 1. Homeowner app shell
Give homeowners their own bottom tab bar and desktop sidebar, matching the pro shell: Home, Care, Documents, Services, Profile. The marketing header stays on public pages only. The dashboard's current tabs collapse into these tabs so nothing is buried in a long scroll.

### 2. Homeowner dashboard as cards
- Hero card: value, equity, gain since purchase, home score ring.
- "Your next step" card stays the top action.
- Care, documents, refi and recommended-pros sections become the same rounded card blocks used on the business dashboards, one action per card.

### 3. Pro screens move into the app shell
Wrap portfolio, campaigns and network for both agent and lender in the business shell so the bottom tab bar is always present and the duplicate in-page tab rows shrink to a single segmented control.

### 4. Consistent card language everywhere
Campaign lists, network/introduction lists and sponsorship lists switch from table/row markup to the existing `SignalCard` / `PersonCard` / `OpportunityCard` primitives, with full-width tap targets and no side scrolling.

### 5. Motion and touch polish
Sheet-style detail panels that slide up from the bottom on mobile, press-state scaling on cards and buttons, safe-area padding, and 44px minimum tap targets across all of the above.

## Verification
Screenshot homeowner, agent and lender screens at 320/375/390/430px and assert no horizontal overflow and no clipped card content.

## Technical notes
- New `src/components/homeowner-shell.tsx` mirroring `business-shell.tsx`.
- Route files touched: `_authenticated/dashboard.tsx`, both `portfolio.$id*` trees, `agent|lender/campaigns.tsx`, `agent|lender/network.tsx`, `requests.$id.tsx`.
- Presentation only: no schema, query or server-function changes.
