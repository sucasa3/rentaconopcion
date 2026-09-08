# Homepage: serve all three audiences — homeowner, lender (#1 customer), agent

## The problem with today's homepage

Every section speaks only to the homeowner. Lenders — the primary paying customer — have no presence above the fold or anywhere on the page. Real estate agents appear only as a generic "Are you a pro?" card mixed in with plumbers and HVAC. The homepage sells a home-organization app, not the relationship-intelligence network lenders and agents actually pay for.

## Approach

Keep the homeowner value story (homeowners activate Home Records — that's the asset lenders and agents pay to serve), but restructure the page so each of the three audiences immediately sees their path. No new backend, no changes to app logic — presentation and routing only. Existing `/lenders`, `/agents`, and `/partner` pages remain the destinations; the homepage becomes the front door for all three.

## Changes (all in `src/routes/index.tsx` + header nav)

### 1. Hero — broaden the promise, add audience paths
- Keep the homeowner headline and primary CTA ("Create Free Home Profile") — homeowner activation is still the top-of-funnel.
- Add a secondary audience row directly under the CTAs: three quiet text links — "For lenders →", "For agents →", "For service pros →" linking to `/lenders`, `/agents`, `/partner`.
- Adjust the subheadline one notch: from "manage your home…" to "the trusted record of your home — connecting you with the professionals who help you own it with confidence." Signals the network without losing the homeowner.

### 2. New section: "One home. Three relationships." (after How It Works)
A three-column audience section — the core of the fix:
- **Homeowners** — "Know your home." Value, equity, care, documents, trusted pros. CTA: Create Free Home Profile.
- **Lenders** — "Know your book." Who to contact today, why now, what to say — with homeowner-permissioned intelligence. CTA: See SuCasa for lenders → `/lenders`.
- **Agents** — "Know your clients." Signals when someone in your book is ready to move — before they call a portal. CTA: See SuCasa for agents → `/agents`.
- Lender card is visually primary (brand gradient or featured treatment) since lenders are the #1 revenue customer; homeowner and agent flank it.

### 3. Reframe the Intelligence Preview
Today it shows generic $482,300/$186,000/$14.8k tiles. Keep the tiles but add one line of copy framing them as "the Home Record every party works from" — reinforcing the shared-record positioning rather than a consumer gadget.

### 4. Fix the Pro Network card
Split the current single "Are you a pro?" card so real estate agents are no longer lumped with service pros: service pros keep the founding-partner card (`/partner`); agents get their own line pointing to `/agents`.

### 5. Header nav
Add "Lenders" and "Agents" links to the site header so the two paying audiences are one tap away from anywhere on the site (desktop nav + mobile menu).

### 6. Final CTA
Keep homeowner-focused ("Start your free Home Profile") but add a small secondary line: "Lender or agent? Talk to us →" linking to `/lenders`.

## What stays the same
- Hero visual (`HomeHero`), How It Works cards, Benefits grid, Services grid, Testimonials — content and styling unchanged.
- No changes to `/lenders`, `/agents`, `/partner` page content in this pass (they already exist as destinations).
- No changes to any app logic, permissions, or data.

## Technical notes
- All edits confined to `src/routes/index.tsx` and `src/components/site-header.tsx`.
- Semantic tokens only (`primary`, `growth`, `gradient-brand`, `shadow-elevated`); mobile-first, staggered fade-in consistent with existing sections.
- Update index `head()` title/description to reflect the multi-audience positioning (e.g. "SuCasa — The trusted record of every home" / description mentioning homeowners, lenders, and agents) while staying under SEO limits.
