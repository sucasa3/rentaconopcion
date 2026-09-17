# SuCasa Agent + Lender Public Conversion Refinement

## Goal
Finish the coordinated public conversion system across `/agents`, `/agents/pricing`, `/lenders`, `/lenders/pricing`, and the `/pricing` role gateway so each audience understands SuCasa within 10–15 seconds.

## Locked conversion paths

```text
Agent: Understand → Start free
                   ↘ Review pricing → Start free / request upgrade

Lender: Understand → Run free Discovery
                    ↘ Review pricing → Discovery → $447 pilot → $149/month
```

- Keep direct free CTAs on both landing pages, with pricing as the secondary path.
- Keep the configured lender pilot as the primary paid progression: free 100-client Discovery, $447 for 90 days, then $149/month unless cancelled.
- Keep the $79 MLO and larger team plans visible as secondary alternatives.
- Preserve attribution on all signup, Discovery, pricing, and paid-interest actions.

## Landing pages

### `/agents`
- Update the hero to the approved relationship-prioritization message while retaining direct `Start Free` and secondary `View pricing` actions.
- Keep the fictional, labeled Agent Today visual immediately beneath the copy on mobile and beside it on desktop.
- Refine the four-step flow to: Know who → Know why → Know what to say → Know what to do next.
- Reduce trust to the concise “Your relationships stay yours” strip.
- Use the approved first-100 closing message and keep the presentation only as a low-priority resource.

### `/lenders`
- Update the hero to begin with the lender’s past-client book while retaining direct `Start Free Discovery` and secondary `View pricing` actions.
- Refine the fictional, labeled Lender Today visual to include qualified estimated property/value context without intent claims.
- Use one concise four-step flow, a compact Discovery conversion band, one sentence about agent relationship value, and a short private-workspace trust statement.
- Keep the presentation and team-pilot inquiry as low-priority resources.

## Pricing pages

### `/agents/pricing`
- Use the approved headline and make Free a full, visually important card without unsupported popularity labels.
- Show exactly three choices: Free/100, Agent/$49/250, Agent Growth/$99/1,000.
- Keep paid CTAs honest: the current agent system records upgrade requests rather than taking payment on the public page.
- Add a compact Agent Today product-proof block and four-question summary.
- Only show an additional-capacity message if supported by the existing agent upgrade experience.

### `/lenders/pricing`
- Lead with Free Discovery → $447 90-Day Pilot → $149/month continuation.
- Feature MLO $79 and MLO Growth $149 as secondary individual options; emphasize Growth without an unsupported popularity claim.
- Present Branch $499, Branch Pro $799, and Network $1,499 in a quieter team-capacity band with configured limits.
- Route new visitors through lender signup/Discovery; preserve protected manager-only checkout in Plan & Billing.
- Add the compact book-to-action product proof and final Free Discovery CTA.

### `/pricing`
- Keep it pricing-free and reduce it to two premium role cards: Loan Officers and Real Estate Agents.

## Shared presentation and navigation
- Reuse the public-safe Agent Today/Lender Today preview system and semantic SuCasa tokens.
- Remove the unsupported “Recommended” badge from the free Agent card.
- Keep white/warm-neutral surfaces, deep navy typography, restrained orange actions, subtle depth, and reduced-motion support.
- Ensure professional landing and footer navigation expose each dedicated pricing page while preserving Sign In and deck routes.

## Preserved behavior
- No changes to authentication, signup activation, Discovery logic, imports, permissions, private workspaces, consent, database schema, or payment logic.
- No claims of predicted moving, refinancing, selling, borrowing intent, guaranteed transactions, or automatic access.
- No public checkout promise where the existing application only supports a signed-in upgrade request or protected organization-manager checkout.

## Verification
- Confirm every primary and secondary CTA destination and attribution source.
- Verify all five public pages at phone and desktop widths, including first-viewport comprehension, no overflow, keyboard focus, reduced motion, and readable contrast.
- Verify both presentation routes and their print behavior remain intact.
- Run type checks and the complete test suite covering Discovery, billing, permissions, imports, and existing application behavior.
- Report changed routes, CTA destinations, reused product visuals, mobile behavior, pricing-source constraints, and confirmation that `/pricing` is role selection only.
