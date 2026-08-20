# Simplify the portfolio/client detail view around action

## Problem

The portfolio pages (agent and lender) currently present several dense sections at once — summary tiles, segment filters, refi opportunities, a full client table, and (for agents) recommendation/referral/high-intent feeds. The most important information — who needs attention right now — is visible, but it does not dominate the view. On mobile the page becomes a long scroll of similarly-weighted cards, so users have to hunt for the next action.

## Goal

Make the portfolio open with a clear, prioritized action queue. Everything else supports that queue rather than competing with it. The same layout must work on mobile and desktop without horizontal scrolling.

## Changes

### 1. Lead with "What to do now"
Add a full-width priority card at the top of both portfolio views. It shows:
- The single most actionable homeowner (highest intent / biggest refi savings / longest overdue item).
- A one-line reason in plain language.
- A primary button that opens the client detail or starts the recommended action.
- A secondary "Next 3" list for the queue.

If there is nothing actionable, the card collapses into a calm empty state: "All caught up — we'll alert you when something changes."

### 2. Reorder and group the page into three zones
```text
1. What to do now        (priority queue)
2. Opportunities         (pre-qualified signals worth acting on)
3. Your book             (searchable, filterable client list)
```

Move the summary tiles and segment chips into a compact sticky header above the client list so they remain available without taking prime screen real estate. For agents, the recommendation/referral/high-intent feeds merge into the Opportunities zone as filtered SignalCards instead of separate tabbed sections.

### 3. Simplify the client list card
Each PersonCard currently shows up to six metrics. Reduce to the two numbers that matter for the role:
- Lender: estimated balance + rate/LTV.
- Agent: estimated value + move-intent band.

Add a single, consistent status pill per row. Remove duplicated address/location text that already appears in the subtitle.

### 4. Make actions reachable on mobile
Convert the client-detail dialog into a bottom sheet on viewports below `md` so the primary action button sits in the thumb zone. Add a sticky floating action button on mobile to quickly add a homeowner or start an enrichment pass, replacing the scattered top-bar buttons.

### 5. Reduce visual noise
- Replace the current mix of `rounded-3xl` cards, inline tables, and ad-hoc borders with the existing `SignalCard` / `OpportunityCard` / `PersonCard` primitives only.
- Use color intentionally: growth green for positive/opportunity signals, attention amber for things needing action, neutral for background status. No new colors.
- Increase whitespace between zones and reduce the number of uppercase labels.

## Verification
- Screenshot the lender and agent portfolio pages at 320/375/390/430px and 1280/1440px.
- Confirm the top of each view leads with a clear action and that no horizontal scrolling occurs.
- Confirm the bottom-sheet detail view opens and closes cleanly on mobile widths.

## Technical notes
- Files touched: `src/routes/_authenticated/lender/portfolio.$id.index.tsx`, `src/routes/_authenticated/agent/portfolio.$id.tsx`, `src/components/ui-kit/index.tsx` (add `BottomSheet` or use existing sheet/dialog), and `src/components/business-shell.tsx` (mobile FAB placement if needed).
- Presentation only: no schema, query, or server-function changes.
