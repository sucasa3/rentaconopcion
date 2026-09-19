# Homepage refinement: homeowner journey first

Refine the current approved homepage rather than redesigning it. Keep the page preview-only and make the homeowner experience the dominant story before introducing professional benefits.

## New page flow

1. **Short opening promise**
   - Preserve the approved headline, subheadline, Start free action, See how it works link, navigation, sign-in, and EN/ES controls.
   - Keep this opening compact so the homeowner product appears quickly.

2. **Full fictional “My Home” dashboard showcase**
   - Replace the current partial Home Profile card with a polished, public-safe recreation of the full current homeowner dashboard.
   - Preserve the real dashboard hierarchy: property-photo summary with estimated value, estimated equity, and Home Score; Home Health and key systems; Home Care with one timely item; documents/history context; and Ask SuCasa.
   - Use one coherent fictional home and mark the entire showcase clearly as fictional demonstration data.
   - On mobile, present it as a readable full-width product view rather than shrinking a desktop dashboard.
   - Do not fetch authenticated data or change the actual homeowner dashboard.

3. **Relevant home-service providers**
   - Follow the dashboard with a short visual bridge showing how a home need can lead to a useful resource.
   - Reuse the existing recommended-professional card pattern for a few clearly fictional service providers, with concise specialty/rating treatment and existing request/browse destinations.
   - Keep this small and curated, not a marketplace or directory wall. Do not imply that a provider is recommended without a demonstrated fictional home need.

4. **Agent and lender benefits**
   - Remove the current Agent Today and Lender Today cards from the top product showcase.
   - Introduce two concise professional sections only after the homeowner and service story is established.
   - Agent: emphasize who deserves attention, why now, what to say, and what to do next; route to `/agents`.
   - Lender: emphasize relevant attention across existing client relationships, factual context, and better-timed outreach; route to `/lenders`.
   - Use safe fictional UI excerpts based on the existing Agent Today and Lender Today patterns, with no intent, qualification, or outcome claims.

5. **Conversion and footer**
   - Keep one homeowner-first Start free action and clear Agent/Lender calls to action.
   - Preserve the existing footer and all current destinations.
   - Remove sections that repeat the same homeowner, service, agent, or lender message.

## Visual and content rules

- Keep the approved SuCasa visual system: warm neutrals, navy structure, restrained orange, property imagery, white product surfaces, subtle shadows, and premium spacing.
- Maintain HOME → CHANGE → UNDERSTANDING → NEXT STEP as the narrative.
- Keep the homeowner experience visually larger and earlier than professional content.
- Complete all changed copy in English and Spanish.
- No real homeowner/provider data, authenticated requests, new product behavior, Home Team changes, backend changes, or publishing.

## Verification

- Verify the full mobile sequence and desktop composition, including readability of the full dashboard recreation.
- Confirm one fictional homeowner showcase, a short provider section, and distinct Agent/Lender benefit paths.
- Check routes, language switching, keyboard focus, contrast, reduced motion, text fit, horizontal overflow, and browser errors.
- Run the existing type checks and full test suite.
- Deliver only at the existing preview URL for approval; do not publish.
