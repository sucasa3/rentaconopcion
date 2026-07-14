## Home Intelligence Report — Monthly Deep-Dive

Build a dedicated `/report` route (linked from the dashboard's **View report** button) that renders a full monthly report for one home using realistic mock data. Free for all homeowners in this pass; single month (October 2026); premium gating and month scrubbing deferred.

### Route & navigation
- New file: `src/routes/report.tsx` at `/report`, `noindex` in head.
- Wire dashboard's **View report** button (in `src/routes/dashboard.tsx`) to `<Link to="/report">`.

### Page structure (top to bottom)

1. **Report header**
   - Month label ("October 2026 · Monthly Report"), address, "Generated Nov 1, 2026" timestamp.
   - Actions: Download PDF (stub), Share link (stub, toast on click), Back to dashboard.

2. **Executive summary card**
   - 3–4 sentence AI-style narrative: what changed, why, what to do. Uses mock voice ("Your home gained $6,200 in estimated value this month, driven by neighborhood comps and a new roof inspection. Electrical panel needs attention before winter.").
   - Delta chips: Value +$6.2k (+1.3%), Equity +$4.1k, Home Score +3, ROI YTD $14.8k.

3. **Value & equity trend** (primary chart)
   - Full-width area chart, 12 months of value + equity (reuse/extend `HOME_HERO.valueSeries`).
   - Annotations: dots on months where notable events happened (roof inspection, HVAC service, comp sale nearby) with hover/tap tooltips.
   - Right-side legend with current, 30-day change, 12-month change.

4. **Home Score breakdown**
   - Radial/ring for overall score (82) + 4 sub-scores: Structure, Systems, Safety, Curb Appeal (0–100 bars).
   - Short "why this score" line per sub-score.

5. **Zone health matrix**
   - 4 zone cards (Roof, HVAC, Plumbing, Electrical) with status pill, last serviced, next due, one-line insight.
   - Electrical = Action needed (matches existing `HOME_HERO.zones`).

6. **Market context**
   - 3 stat tiles: Neighborhood median $/sqft, 90-day price trend, active listings within 1 mi.
   - Small comps table (3 recent nearby sales: address abbreviated, sold price, $/sqft, delta vs your home).

7. **Maintenance activity this month**
   - Timeline list: completed tasks, in-progress requests, external services logged (pull shape from `RECENT_REQUESTS`).
   - Spend summary: total $ this month, YTD, projected annual.

8. **Recommended next actions** (the payoff)
   - 4–5 prioritized cards, each with: priority pill (Urgent / This month / Plan ahead), title, why it matters, est. cost range, est. ROI or risk avoided, primary CTA (Request quote → links to `/request`, or Learn more).
   - Example items: "Replace electrical panel breaker" (Urgent, $600–$1,200), "Schedule HVAC winter tune-up" (This month, $180–$260), "Refinance check — rates dropped 0.4%" (Plan ahead), "Repaint south-facing trim" (Plan ahead).

9. **12-month projection**
   - Small line chart projecting value + equity forward using existing `projectHome()` helper from `src/lib/home-hero-data.ts`.
   - Callout: "If you complete recommended actions, projected Home Score reaches 91 by next October."

10. **Footer**
    - "This report was generated using your home profile, service history, and public market data. Estimates only." + disclaimer.

### Data
- New file: `src/lib/report-mock-data.ts` — exports one `OCTOBER_REPORT` object with all sections (summary, trend series with event annotations, sub-scores, zones reuse, comps, activity, recommendations, projection meta).
- Reuse `HOME_HERO` and `projectHome` from `src/lib/home-hero-data.ts`; reuse `RECENT_REQUESTS` shape for the activity timeline.

### Charts
- Use `recharts` (already a shadcn dependency in this template) — AreaChart for trend, LineChart for projection, simple SVG for radial score. No new packages if `recharts` is installed; otherwise fall back to hand-rolled SVG (verify during build).

### Design
- Match existing dashboard: `rounded-3xl border border-border bg-card shadow-soft`, `gradient-brand` for hero band, `gradient-growth` for CTAs.
- Mobile-first: single column on <sm, 2-col grid on md+, executive summary and primary chart always full-width.
- Reuse `SiteHeader` / `SiteFooter`.

### Out of scope this pass
- Real data wiring, PDF generation, share links, month scrubber, premium gating, AI generation of narrative.
