# Refine the homepage action layer and professional product proof

Keep the approved homeowner-first homepage, hero, complete fictional My Home showcase, navigation, final homeowner CTA, footer, and all existing destinations. Change only the Home Services handoff and the Agent/Lender product demonstrations.

## Home Services action layer

- Preserve the eight existing service-category cards and their colorful category icons.
- Replace the marketplace-style heading with:
  - **Your home tells you what it needs. SuCasa helps you take care of it.**
  - **Maintenance, repairs, improvements, and unexpected problems — get to the right help without starting from scratch.**
- Make the transition from **Annual HVAC service is coming up** visually continuous and give HVAC a restrained recommended-next-step treatment.
- Keep HVAC’s factual category description and its working **Request service** destination; present the other categories as help available when future needs arise.
- Remove response-time badges from the homepage because the current values are static demonstration data, not verified partner performance.
- Add the quiet disclosure: **Service requests may be fulfilled through SuCasa service partners.**
- Preserve **Browse all services** and do not change the actual Home Services page or request behavior.
- Do not add providers, ratings, reviews, availability, inventory, or live lookups.

## Shared Agent Today product preview

- Replace the simple homepage Agent card with a reusable, fictional miniature dashboard adapted from the real Agent Today hierarchy.
- Show a compact Daily Read, relationships-worth-attention count, one clearly prioritized homeowner, **Why now**, a suggested opener, recommended next action, and restrained quick-action affordances.
- Keep the promise focused on relationship timing: who needs attention, why now, what to say, and what to do next.
- Use the established warm relationship surface, intelligence-blue interpretation surface, small orange opportunity marker, quiet status treatment, and one elevated priority card.

## Shared Lender Today product preview

- Create a visually distinct fictional miniature dashboard adapted from the real Lender Today hierarchy.
- Show a portfolio Daily Read, existing relationships worth attention, a few concise relationship categories, one priority client, factual **Why now**, useful home/mortgage context, and one clear next action.
- Keep all language conditional and relationship-oriented; do not imply approval, savings, qualification, or guaranteed opportunity.
- Use the same SuCasa visual system while making the lender view read as a monitored book, not a duplicate of the agent view.

## Homepage integration and reuse

- Keep the Agent and Lender marketing copy and CTAs concise; let the richer product previews carry the explanation.
- Build the two previews as shared public demo components so the same visual language can be reused on `/agents` and `/lenders` without touching authenticated data or changing the actual Agent Today and Lender Today behavior.
- Preserve the current homepage sequence and homeowner visual dominance; do not add sections or turn the page into three separate landing pages.
- Keep every demo name, metric, home, and scenario visibly labeled fictional in English and Spanish.

## Technical details

- Update the homepage service treatment and replace the current simplified professional-demo components with reusable public preview components derived from existing Agent Today, Lender Today, priority-card, and intelligence-surface patterns.
- Use existing semantic color tokens and design-system controls; no backend, permissions, pricing, authentication, or route changes.
- Keep the current `/request?category=...`, `/services`, `/agents`, and `/lenders` destinations intact.

## Verification

- Verify the complete English and Spanish homepage at 390px and 1280px, including text fit, hierarchy, keyboard focus, reduced motion, overflow, and browser errors.
- Confirm the homepage contains all eight service categories, HVAC is the only contextual recommendation, no response-time claims remain there, and the partner disclosure is visible.
- Confirm Agent and Lender previews are clearly fictional, visually distinct, and contain no unsupported claims or real account data.
- Check all affected CTA destinations and verify `/agents` and `/lenders` remain intact if they adopt the shared preview.
- Run type checks and the complete existing test suite.
- Keep all changes at the preview URL only; do not publish.
