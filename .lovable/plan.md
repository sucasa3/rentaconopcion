# SuCasa Agent + Lender Public Conversion Experience

## Goal

Create one coordinated, mobile-first four-page professional funnel:

```text
/agents          → /agents/pricing  → Start free / request an upgrade
/lenders         → /lenders/pricing → Free Discovery / subscribe
/pricing         → role-selection gateway
```

Visitors should understand the role-specific value, see the real product, and find the correct next step within 10–15 seconds.

## 1. Shared premium conversion system

- Build reusable public-page sections for the professional header/footer, concise section introductions, product previews, trust language, pricing cards, and final conversion bands.
- Apply the existing semantic SuCasa tokens: white and warm-neutral surfaces, deep navy typography, restrained SuCasa orange actions, warm borders, subtle shadows, restrained radii, and accessible focus states.
- Use elegant desktop split heroes with concise copy on one side and an authentic product preview on the other; stack copy, CTAs, and preview in a strong mobile order.
- Add subtle entrance and hover transitions with reduced-motion support.
- Keep imagery product-led: no stock homes, decorative house graphics, fake social proof, invented counts, ROI promises, or presentation-style walls of content.

## 2. Agent landing page — `/agents`

- Retain the proven headline and immediately explain the core outcome: SuCasa prioritizes existing homeowner relationships with a factual reason and next step.
- Place a compact, public-safe adaptation of Agent Today high in the first screen, using clearly fictional data and an “Illustrative demo” label.
- Use a short conversion narrative rather than the current long presentation structure:
  1. Existing relationships become a prioritized daily worklist.
  2. Agent Today shows who, why now, what to say, and what to do next.
  3. The first 100 Home Profiles remain free and independent of a lender relationship.
  4. Privacy and permissions remain unchanged.
- Primary CTA: **Start free** / **Get 100 Home Profiles Free** → existing `/agent-start` flow with attribution.
- Secondary CTA: **View pricing** → `/agents/pricing`.
- Preserve **View presentation** → `/agents/deck` and **Sign in**.

## 3. Agent pricing — `/agents/pricing`

- Create a dedicated, indexable page with three clear choices sourced from the current supported offer:
  - Free: first 100 Home Profiles.
  - Agent: 250 Home Profiles at $49/month.
  - Agent Growth: 1,000 Home Profiles at $99/month.
- Keep the comparison concise and role-correct; emphasize capacity and legitimate agent features, not lender qualification or refinance logic.
- New users start through `/agent-start` with pricing attribution.
- Existing agents use the existing signed-in upgrade-request workflow; do not invent self-serve agent checkout or imply an immediate card charge.
- Explain this distinction in CTA language so “Upgrade” is not misleading.

## 4. Lender landing page — `/lenders`

- Compress the existing long page into a product-led acquisition page centered on free Opportunity Discovery.
- Put a compact, public-safe Lender Today/Discovery preview high in the page with fictional names and data, explicitly labeled illustrative.
- Use a short sequence:
  1. Upload up to 100 past clients free.
  2. SuCasa reuses canonical home intelligence and ranks factual opportunities.
  3. Reveal the highest-priority opportunities and the reason attached.
  4. Continue with the existing 90-Day Pilot and monthly monitoring path.
  5. Preserve the agent+lender value loop and a concise trust/permissions section.
- Primary CTA: **Start Free Discovery** → `/lender-start` with attribution.
- Secondary CTA: **View pricing** → `/lenders/pricing`.
- Preserve **View presentation**, **Sign in**, and the existing team-pilot inquiry.
- Keep all copy factual: no prediction of intent, movement, refinance, sale, qualification, or transaction.

## 5. Lender pricing — `/lenders/pricing`

- Create a dedicated, indexable lender page that clearly separates:
  - Free Discovery for up to 100 clients.
  - The existing 90-Day SuCasa Pilot at $447, continuing as MLO Growth at $149/month unless cancelled.
  - Current monthly lender capacity plans and configured allowances.
- Make **Start Free Discovery** the primary acquisition action for visitors.
- Route authenticated organization managers to the existing protected billing/checkout experience for direct subscriptions; route new visitors through lender start/Discovery rather than generic auth.
- Preserve the current payment provider, owner/admin checkout gate, subscription synchronization, webhook verification, pilot conversion, and complimentary admin-only activation.
- Do not expose internal enrichment costs or imply that every listed plan has a new checkout path beyond what is currently configured.

## 6. Pricing gateway — `/pricing`

- Replace the mixed plan grid with a simple role-selection page:
  - **I’m a real-estate agent** → `/agents/pricing`.
  - **I’m a mortgage lender** → `/lenders/pricing`.
- Give each role one sentence of value and one authentic mini product cue.
- Add unique metadata and retain the canonical `/pricing` URL.

## 7. Navigation, metadata, and attribution

- Add role-correct pricing links from both landing pages and the professional footer without disturbing homeowner navigation or IDX links.
- Give `/agents/pricing` and `/lenders/pricing` unique title, description, Open Graph metadata, canonical URL, `og:type`, and Twitter card metadata.
- Preserve `/agents/deck` and `/lenders/deck`, including noindex, slide navigation, presentation mode, and print/PDF behavior.
- Extend the existing allow-listed, non-blocking, PII-safe funnel events for pricing-page views and role-correct CTA clicks while retaining source/campaign/referrer attribution.

## 8. Boundaries preserved

- No changes to authentication, role-specific signup, idempotent workspace activation, Discovery processing, imports, canonical facts, ranking, permissions, consent, private workspaces, or provider-call reuse.
- No new data models, billing architecture, payment products, entitlements, access rights, or homeowner visibility.
- Agent upgrades remain requests; lender payments remain the existing protected checkout flows.
- Existing public pilot lead capture remains available.

## 9. Verification

- Test all five public routes at 320px, 390px, tablet, and desktop widths for hierarchy, wrapping, overflow, and first-screen CTA/product visibility.
- Verify keyboard navigation, focus visibility, landmarks, labels, contrast, reduced motion, and screen-reader names.
- Exercise every CTA and back-link across landing → pricing → signup/Discovery/billing, including attribution persistence.
- Confirm both decks and print views still work and remain noindex.
- Verify signed-out and signed-in conversion behavior, role boundaries, agent free activation, agent upgrade requests, lender Discovery, and lender manager-only checkout.
- Run relevant route, funnel-event, Discovery, billing/security, and full regression tests; check browser console and network failures on the redesigned pages.
