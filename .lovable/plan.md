# Real numbers in the homeowner hero

Two hero figures are hardcoded today and identical on every account:

- `▲ +$8,400 · 30d` under Estimated value — a literal string in the hero component, not data.
- `Upgrade ROI $15K · 3 smart picks` — a fixed `roi: 14800` constant in the hero seed data.

Nothing else in the hero is fake: address, value, equity, equity %, Home Score and the system zones already come from the shared property-intel query.

## What we can show instead

### 1. Appreciation (replaces the fake 30-day trend)

We don't store value history yet, so a real "last 30 days" number doesn't exist. Fix it in two layers:

**Now — gain since purchase (real, already in the data).** Public sale history gives the last sale price and date. Show:
`▲ $126,400 since 2019 purchase · ~4.1%/yr`
If there's no recorded sale, fall back to `Assessed value, updated 2025` (tax year) or simply hide the trend line rather than invent one.

**Ongoing — start tracking so a true 30-day trend appears over time.** Record a dated snapshot of the resolved value each time a profile's intel refreshes. Once two snapshots exist, the hero shows the real change and its window (`▲ $3,900 · since Jun 14`). Until then it shows the purchase-gain line.

The projection slider stays as-is but gets labeled "estimate" so it's clearly a model, not a measurement.

### 2. Upgrade ROI (replaces the fixed $15K)

Compute it from the home's own systems instead of a constant. For each system already tracked in the maintenance timeline (roof, HVAC, water heater, windows, electrical panel, siding), we know age, remaining life and status. Take the three that are overdue or due soonest, and for each estimate:

- project cost, scaled to the home's square footage and category
- typical resale value recovered (cost-vs-value recovery rate per category)
- the resulting value impact

The hero then shows the summed value impact of those three picks, and the "3 smart picks" text becomes a tap target listing the actual items (e.g. "Roof replacement, HVAC, water heater"). If fewer than three systems qualify, show what exists ("2 smart picks"); if none, the tile shows "Systems on track" instead of a dollar figure.

Every estimate gets an info popover stating it's a range based on typical local costs and recovery rates, not a quote — and each pick links into the existing request flow with its category preselected.

## Technical notes

- `src/components/home-hero/HomeHero.tsx`: remove the hardcoded trend string and the `roi` default; accept `appreciation` and `upgradeRoi` props with explicit "unknown" states.
- New `src/lib/appreciation.ts`: derive gain-since-purchase from the sales summary plus resolved value, and pick the best available snapshot window.
- New `src/lib/upgrade-roi.ts`: per-category cost and recovery-rate table, scaled by sqft, driven by the maintenance timeline items the dashboard already builds.
- New table `public.home_value_snapshots` (profile id, resolved value, source, captured date, unique per profile per day) with RLS limiting reads to the owner and admins, plus GRANTs; written server-side from the existing intel path.
- `src/routes/_authenticated/dashboard.tsx`: pass the computed appreciation and ROI into `HomeHero`; `src/lib/home-hero-data.ts` keeps only shape/labels, no seeded dollar values.
