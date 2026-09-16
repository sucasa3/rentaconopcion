# Product-led SuCasa Agent Landing Page

## Goal

Turn `https://sucasa.com/agents` into a mobile-first public conversion page built from the existing agent presentation and authentic Agent Today product language.

Within the first mobile viewport, an agent should understand:

> Your homeowner relationships already have value. SuCasa helps you know who deserves attention, why now, what to say, and what to do next.

The free allowance supports the offer but will not lead the positioning.

## Conversion hierarchy

- Primary action throughout: **Start free**
- Secondary action near the hero: **View presentation**
- Existing-user action: **Sign in**
- Preserve campaign/referrer attribution through signup where the current first-party architecture supports it.
- Make the next step explicit: account creation → agent workspace → onboarding/demo state → optional database import or connection.

## Page structure

1. **Hero and immediate product proof**
   - Keep the SuCasa logo and public navigation.
   - Lead with “You already have the relationships. Let’s make them worth more.”
   - Explain the four answers SuCasa provides: who deserves attention, why now, what the agent could say, and the practical next step.
   - Place a focused, legible Agent Today product state in or immediately below the hero.
   - On mobile, show a cropped authentic product state rather than shrinking desktop UI into an unreadable frame.

2. **From database to relationship engine**
   - Contrast a static contact list with a calm, prioritized weekly list.
   - Explain signals as changes and reasons to reconnect—not predictions of selling, refinancing, moving, transacting, or homeowner intent.
   - Avoid guaranteed-conversion language.

3. **See how a recommendation works**
   - Show the four-part recommendation clearly:
     - Who deserves attention?
     - Why now?
     - What could I say?
     - What is the practical next step?
   - Reuse existing Agent Today visual patterns and components where practical.
   - Any displayed names, homes, values, equity, reasons, or conversation examples must be fictional, visibly labeled illustrative demo content, and never drawn from production homeowner records.

4. **Stay relevant between transactions**
   - Adapt the presentation’s homeowner journey and “become the first call” story.
   - Show how SuCasa helps an agent remain useful across value, equity, maintenance, financing, improvements, moves, referrals, and repeat transactions.

5. **Relationships and privacy**
   - State explicitly that the agent remains responsible for and in control of professional relationships.
   - State that homeowners retain their own choices and permissions.
   - Explain that uploading or creating a Home Profile does not automatically give a lender, provider, sponsor, or other professional access.
   - Confirm that visibility follows SuCasa’s existing relationship, permission, consent, role, and access rules.
   - State that SuCasa does not sell the agent’s uploaded database.
   - Introduce no new access rights.

6. **How it starts**
   - Create the agent account and workspace first.
   - Let the agent enter the workspace without importing contacts.
   - Offer a clearly labeled demo/onboarding state, then guide them to CSV import or the existing supported connection flow.
   - Explain that SuCasa creates reusable Home Records and returns a prioritized work list from the existing canonical fact system.

7. **Offer and final action**
   - Present the existing free-agent offer accurately: up to 100 Home Profiles, with paid capacity options linked to `/pricing`.
   - Keep the allowance secondary to the product value.
   - Repeat **Start free**, with **Sign in** for existing agents.

## Routes and presentation preservation

- Replace the current slide viewer at bare `/agents` with the new indexable landing page.
- Preserve the full presentation at `/agents/deck`, including slide navigation, fullscreen, and printable/PDF mode.
- Add an explicit platform exception for `/agents/deck` before the existing legacy `/agents/*` IDX redirect rule.
- Keep bare `/agents` on SuCasa and continue sending all other legacy deep `/agents/*` URLs to the IDX host with paths and query strings preserved.
- Update the public header’s **For Agents** link from the protected `/agent` workspace to public `/agents`.
- Add appropriate Agent links to the public footer while leaving homeowner, lender, provider, and authenticated workspace routes intact.

## Role-specific Start free flow

Use the existing `profiles` records and idempotent agent workspace activation; do not create a parallel profile model.

- Add a public agent-specific account creation path reached from `/agents`.
- Collect the existing profile fields needed for setup: name, email, password or Google sign-in, and brokerage/team name.
- Handle email confirmation correctly before treating signup as authenticated.
- After authentication, create or reuse only the agent’s organization, owner membership, and book through the existing activation service, then continue to `/agent`.
- Preserve invitation-based activation as a separate flow with its signed token, matching-email checks, and reconciliation behavior.
- Point agent pricing CTAs to the same agent-specific start path so they no longer create homeowner-only accounts.
- Do not require import before workspace entry.
- Do not create homeowner access, a lender relationship, sponsorship, provider access, paid entitlement, or any permission/consent bypass.

## Funnel analytics

Use first-party project instrumentation only; do not add an analytics vendor.

Capture these milestones:

- `agent_landing_view`
- `agent_start_clicked`
- `agent_deck_viewed`
- `agent_pricing_clicked`
- `agent_signin_clicked`
- `agent_signup_started`
- `agent_signup_completed`
- `agent_workspace_activated`
- `agent_import_started`
- `agent_import_completed`
- `agent_first_profile_created`

Implementation rules:

- Reuse the existing event/audit conventions where they fit; add only the smallest first-party funnel event path needed for anonymous landing interactions.
- Keep event payloads allow-listed and free of homeowner personal information.
- Carry sanitized source, campaign, landing path, and referrer context from the public visit through account creation where possible.
- Make event writes non-blocking so analytics failure never prevents signup, activation, import, or profile creation.
- Deduplicate completion milestones so retries and idempotent activation do not inflate conversions.

## Visual direction

- Follow the established SuCasa light public system: white/light-neutral surfaces, deep navy structure, strong orange relationship accents, intelligence blue, and restrained green.
- Translate the presentation’s premium dark energy into selective deep-navy sections rather than making the whole page dark.
- Use real product UI as the dominant visual asset, with generous typography, crisp icon circles, thin borders, compact sections, and restrained motion.
- Respect reduced-motion preferences.
- Avoid generic illustrations, unsupported testimonials, fabricated outcomes, pastel-filled major cards, and unverified statistics.
- Use no horizontal scrolling at mobile widths and keep all tap targets accessible.

## Search and sharing

- Add an indexable `/agents` title, description, Open Graph title/description/type, Twitter card, and canonical `https://sucasa.com/agents`.
- Keep `/agents/deck` excluded from search.
- Use one H1 and semantic section headings.
- Add no social image unless a correctly sized image actually shown on the page is available.

## Verification and acceptance

- Verify at 320, 375, 390, and 430px plus desktop: immediate CTA, legible product proof, no overlap, no horizontal scrolling, compact spacing, and accessible controls.
- Confirm an unfamiliar agent can answer: what SuCasa is, why it helps an existing database, what it tells them, what the product looks like, who controls the relationship, who gets access, what it costs to start, and what happens after Start free.
- Test header/footer navigation, Start free, View presentation, pricing, sign-in, deck controls, fullscreen, and print mode.
- Complete fresh email and Google agent signup checks, including the email-confirmation state where applicable.
- Confirm workspace activation is idempotent and lands at `/agent` without database import.
- Confirm invitation activation still works independently.
- Confirm signup creates no homeowner access, lender connection, sponsorship, provider access, paid entitlement, or permission change.
- Verify every named funnel event, attribution continuity, retry deduplication, and non-blocking failure behavior.
- Confirm bare `/agents`, `/agents/deck`, and legacy deep `/agents/*` behavior.
- Check keyboard navigation, focus visibility, contrast, reduced motion, metadata, console output, type checks, and automated tests.
