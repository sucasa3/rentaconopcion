# Preview the lender dashboard at 250 clients

Right now `/lender/portfolio/$id` just renders a raw client table with 5 columns and no summary — at 250 rows it would be a long scroll with no signal. To actually *show* what the experience looks like at scale, we need two things: (1) enrich the dashboard so 250 clients look like an intelligence tool, not a spreadsheet, and (2) seed 250 realistic demo rows into a portfolio on your lender account so you can view it live.

## What you'll see after this ships

A single portfolio page with three zones:

```text
┌─────────────────────────────────────────────────────────────┐
│  Q3 Refi Book · Demo Lender                                 │
│  250 clients · $92.4M originated · avg rate 6.82%           │
├─────────────────────────────────────────────────────────────┤
│  [Refi-ready 38]  [Rate-and-term 71]  [Cash-out 44]        │
│  [Consented 62]   [Pending 188]       [Cold leads 0]        │
├─────────────────────────────────────────────────────────────┤
│  Refi opportunities (top 10 by monthly savings)             │
│  ─ Sorted list w/ est. savings, equity, LTV                 │
├─────────────────────────────────────────────────────────────┤
│  All clients · search · filter · paginated 25/page          │
│  Name | Address | Loan @ close | Rate | Equity | Consent    │
└─────────────────────────────────────────────────────────────┘
```

## Plan

### 1. Portfolio summary strip (aggregates)
Compute in `getPortfolio` on the server (cheap over 250 rows): total clients, total loan volume, weighted avg rate, avg term, avg months since close. Render as a metric row across the top of the portfolio page.

### 2. Opportunity segments
Bucket each client into one of: **Refi-ready** (rate ≥ 1pt above today's benchmark, ≥ 12 mo seasoned), **Rate-and-term** (rate 0.5–1pt above), **Cash-out candidate** (est. equity ≥ $75k), **Watchlist** (everyone else). Show as clickable chip filters above the table.

### 3. Refi opportunities panel
Top 10 clients sorted by estimated monthly payment savings (using stored close rate vs. an assumed current benchmark rate — we'll expose the benchmark as a small "Assumed rate" input so it's clearly a lender-controlled model, not a promise). Each row: name (masked if no consent), address, est. savings/mo, LTV band.

### 4. Client table upgrades
- Add **Equity** column (from close data heuristic where no ATTOM pull) and **Months since close**.
- **Search** by name/address/zip (client-side over the fetched set).
- **Pagination** 25 per page with page controls — 250 rows in one DOM block is what makes it feel like a spreadsheet.
- Sticky header + zebra rows so long scans stay readable.

### 5. Seed a 250-client demo portfolio
Insert a demo lender org, add your user as a member, create a "Demo Book · Q3 2026" portfolio, and generate 250 realistic client rows spread across GA/FL/TX/NC/AZ with varied close dates (2019–2025), rates (2.75%–7.5%), and loan sizes ($180k–$820k). ~25% marked `consent granted` so masking behavior is visible, the rest pending.

Consent-gated masking already exists in `lender.functions.ts` — the new UI honors it unchanged.

## Technical details

- **Server**: extend `getPortfolio` in `src/lib/lender.functions.ts` to return `{ portfolio, clients, summary, segments, topRefiOpportunities }`. Segmentation + savings math is a pure function over the already-fetched client rows — no extra queries.
- **UI**: split `portfolio.$id.tsx` into small components — `PortfolioSummary`, `SegmentChips`, `RefiOpportunitiesPanel`, `ClientsTable` (with search/pagination/sort). Keep everything in `src/routes/_authenticated/lender/` or `src/components/lender/`.
- **Seed data**: two-step — a schema-safe SQL migration ensures the demo org + portfolio + membership exist; a data insert generates the 250 client rows deterministically (fixed seed) so re-running is idempotent. Membership binds to your currently signed-in user id.
- **No changes** to RLS, GHL sync, ATTOM budget, or homeowner-side code.

## Out of scope (call out for later)
- Live ATTOM enrichment across all 250 rows (would blow the API budget — we use stored close-time data for the demo).
- Bulk consent-request outreach flow.
- CSV export of the segment lists.

## One thing to confirm
The seed portfolio will attach to the lender account you're currently signed in as. If you'd rather I seed it under a fresh "Demo Lender" org and add your user as a member of that org instead of using an existing one, say the word and I'll do that — otherwise I'll add it as a new portfolio under your existing lender org (or create one if you don't have any yet).
