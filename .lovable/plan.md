# SuCasa Agent Landing Page

## Goal

Turn `https://sucasa.com/agents` into a polished, mobile-first public landing page that explains SuCasa for real-estate agents using the strongest ideas and product views from the existing presentation.

The page will make one promise clearly: agents already have valuable homeowner relationships; SuCasa helps them know who deserves attention, why now, what to say, and what to do next.

## Page structure

1. **Hero**
   - Keep the SuCasa logo and public-site navigation.
   - Lead with “You already have the relationships. Let’s make them worth more.”
   - Support it with the database-to-intelligence-to-opportunity message.
   - Primary action: **Start free**.
   - Secondary action: **View presentation**.
   - Show an authentic product preview of the Agent Today experience rather than decorative imagery.

2. **From database to relationship engine**
   - Contrast a static contact list with a short, prioritized weekly list.
   - Explain the three core questions: who to call, why now, and what to say.
   - Keep signal language careful: SuCasa surfaces conversation opportunities, not predictions of homeowner intent.

3. **See the product in action**
   - Reuse the existing Agent Today product presentation in a responsive phone/dashboard frame.
   - Explain that each suggested conversation includes the supporting reason and one practical next step.
   - Clearly label any example homeowners or figures as illustrative demo content.

4. **Stay relevant between transactions**
   - Adapt the presentation’s homeowner journey and “become the first call” story.
   - Show how SuCasa helps an agent remain useful across value, equity, maintenance, financing, improvements, moves, referrals, and repeat transactions.

5. **Your relationships stay yours**
   - Explain that the agent remains the trusted relationship owner and Home Team coordinator.
   - Include concise trust language covering agent control, homeowner choice, privacy, and no resale of the agent’s database.
   - Do not imply that a lender, provider, relationship claim, or account automatically receives homeowner access.

6. **How it starts**
   - Bring a database by CSV or supported CRM export.
   - SuCasa builds reusable Home Records from the platform’s existing canonical fact system.
   - The agent receives a calm, prioritized weekly work list.

7. **Agent offer and final action**
   - Present the existing free-agent offer accurately: free account with up to 100 Home Profiles, with paid capacity options linked to `/pricing`.
   - Repeat **Start free** as the primary action and provide **Sign in** for existing agents.

## Route and presentation preservation

- Replace the current slide viewer at bare `/agents` with the new indexable landing page.
- Preserve the complete presentation at `/agents/deck`, including slide navigation, fullscreen mode, and printable/PDF mode.
- Keep the existing migration behavior: bare `/agents` remains on SuCasa, while legacy deep `/agents/*` URLs continue redirecting to the IDX host—except the explicit new `/agents/deck` platform route.
- Update the public header’s **For Agents** link to `/agents`; keep the authenticated workspace at `/agent` unchanged.
- Add appropriate Agent links to the public footer without changing homeowner, lender, or professional destinations.

## Start-free flow

The current generic signup creates a homeowner account, so it cannot truthfully power the agent CTA.

- Add a dedicated public agent-start flow that collects the agent’s name, email, password or Google sign-in, and brokerage/team name.
- Reuse the existing idempotent agent workspace activation service without an invitation token.
- Preserve the invitation flow separately; invited agents continue using their signed invitation links and existing reconciliation rules.
- After setup, send the agent to the existing `/agent` workspace.
- Update agent pricing buttons to use this same agent-specific start flow.
- Keep all existing permissions, consent, relationship, access, and role rules unchanged.

## Visual direction

- Use the established SuCasa light public system: white and light-neutral surfaces, deep navy structure, orange relationship accents, intelligence blue, and restrained green.
- Translate the presentation’s premium dark energy into focused navy sections rather than making the whole page dark.
- Use generous typography, compact product-led sections, crisp icon circles, thin borders, and restrained motion with reduced-motion support.
- Avoid generic marketing illustrations, unsupported testimonials, fabricated outcomes, pastel-filled major cards, and unverified statistics.

## Search and sharing

- Add unique `/agents` title, description, Open Graph title/description/type, Twitter card, canonical `https://sucasa.com/agents`, and indexable robots behavior.
- Keep `/agents/deck` excluded from search.
- Use one H1 and semantic section headings.

## Verification

- Verify the landing page at 320, 375, 390, and 430px plus desktop with no horizontal overflow or overlapping text.
- Test public header/footer navigation, Start free, View presentation, pricing, sign-in, deck controls, fullscreen, and print mode.
- Complete a fresh agent signup and confirm it creates/reuses an agent workspace, lands at `/agent`, and does not create any homeowner access, lender connection, sponsorship, or paid entitlement.
- Confirm invitation-based activation still works independently.
- Confirm bare `/agents`, `/agents/deck`, and legacy deep `/agents/*` redirect behavior.
- Check keyboard navigation, focus visibility, contrast, reduced motion, metadata, console output, type checks, and automated tests.
