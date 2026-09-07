# SuCasa Agent Experience: invitation → activation → daily operating system

This is a presentation, onboarding and orchestration upgrade. No architecture rewrite.
All permissions, homeowner consent, lender-agent connection rules, sponsored-homeowner
privacy, ranking, the opportunity engine, property intelligence, campaigns, CRM,
outcomes and network relationships stay exactly as they are.

---

## A. Invitation email redesign

Move away from the dark-blue header with the drawn house. New treatment:

- Real SuCasa logo (orange mark, charcoal wordmark) on a white/warm-neutral header
  with a hairline bottom border. Navy used only for headings and small accents.
- Generous spacing, large readable type, one column, mobile-first.
- Content order: logo → "You've been invited to SuCasa" → "[Lender] is giving you
  access…" → a soft callout "Your database is about to get smarter." → three short
  benefits (Know who to contact / See opportunities earlier / Have something useful to
  say) → primary button "Accept invitation" → "Takes about 60 seconds." → reassurance
  line → sponsorship line when the lender is sponsoring.
- No gradients, no stock imagery, no promotional clutter.

Because every SuCasa email shares this header, the whole email family becomes lighter
and more on-brand in the same change.

## B. Agent invitation landing page (`/agent-invite`)

A personalized invitation plus product preview, not a bare sign-up form.

1. Hero: logo, eyebrow "INVITED BY [LENDER]", headline "Turn your past clients into
   your next opportunities.", supporting line, "Activate my SuCasa" button, sponsorship
   line, subtle lender name/avatar.
2. "Know who needs you today" — a miniature, non-interactive replica of a real contact
   card (who / why now / suggested action / action button).
3. "Find listings hiding inside your database" — miniature opportunity card with
   estimated net proceeds, tenure, equity, permit, list-readiness, plus the existing
   modeled-estimate disclaimer wording ("potential", "signal", "may").
4. "Stay relevant between transactions" — four relationship moments (home condition,
   anniversary, equity milestone, permit) each with a suggested outreach line.
5. "Ask SuCasa" — plain-English question examples.
6. "Never stare at a name wondering what to say" — miniature drawer with why-now
   signals, suggested opener and Copy/Text/Email/Call, then "Generate brief".
7. Closing CTA: "Your next listing may already be in your database." + Activate button
   + "Sponsored by [Lender] • Setup takes about 60 seconds".

All preview content on this page is illustrative sample data — no real homeowner data
is shown before sign-in.

## C. Agent onboarding flow

Activate → sign in or create account (email pre-filled from the invitation) → confirm
agency/team name (pre-filled from the invitation) → a short provisioning moment with
sequenced lines ("Creating your workspace…", "Connecting your sponsor…", "Preparing
your homeowner intelligence…") resolving into three checkmarks and an "Enter SuCasa"
button.

Behind that moment we create the agent's agency, make them its owner, create their
first client book, connect the sponsoring lender's invitation, and route them to the
agent workspace instead of the homeowner dashboard. This is what was missing for
info@sucasa.com — today there is no self-serve way to become an agent at all, so every
new account lands as a homeowner.

A self-serve version of the same step is available to agents who arrive without an
invitation, and the existing info@sucasa.com account gets its workspace created and its
pending SuCasa Demo Lender invitation connected.

## D. Agent Today information architecture

```text
Today                                  (title + "Here's where your relationships need attention.")
7 people worth your attention today    (hero summary: 3 listing signals / 2 follow-ups / 2 check-ins)
YOUR BEST MOVE                         (single highest-ranked homeowner: why now,
                                        suggested opener, Call/Text/Email, View opportunity)
Next up                                (3 compact rows)
Who to contact today                   (Hot / Warm / Nurture list, existing logic)
Intelligence strip                     (compact: 101 homeowners · 49 hot · 4 listing signals ·
                                        61 tasks · 0 connected homeowners)
Campaigns                              (one-line summary)
```

The five large KPI tiles move below the action content and become a compact,
horizontally scrollable strip. "Activated" is relabelled "Connected homeowners" with a
short explanation of what activation means and an "Invite homeowners" action, without
pressuring the agent.

## E. Contact card and opportunity drawer hierarchy

Card (answers four questions without opening anything): WHO → WHY NOW → WHAT TO DO →
WHAT TO SAY, then Call/Text/Email, then quick outcome logging.

Drawer, reordered to tell a story:
1. Why this homeowner
2. The strongest 2–4 signals
3. What it could mean (estimated value, potential net proceeds, with the existing
   estimate footnote)
4. Start the conversation — suggested opener + Call/Text/Email
5. Deeper property detail, permits, maintenance recommendations, listing status,
   listing/homeowner brief

Signal types get one restrained visual language shared across cards and drawer:
opportunity, relationship moment, home intelligence, home condition, equity milestone,
anniversary, homeowner engagement.

## F. First-run experience

Four value moments, skippable at any point: SuCasa watches your book → this homeowner
may deserve your attention (anchored on their real top-ranked person) → and we'll help
you know what to say → you can also ask questions about your whole book. Ends with
"Show me today's opportunities". Shown once, then never again.

## G. Empty state for a brand-new agent

"Let's make your database smarter." + supporting copy + "Import my database" primary,
"Add one homeowner" secondary, and a four-step "what happens next" explanation. No
empty dashboard, no zeroed KPI grid.

## H. What gets reused (not rebuilt)

- `business.functions.ts` (`getBusinessOverview`, workspace routing), `nba.server.ts`
  next-best-action, `agent.server.ts` signals/move-score/listing-readiness,
  `agent.functions.ts` portfolio, brief generation, CSV import, add-client.
- `tasks-workspace.tsx`, `opportunities-board.tsx`, `copilot-search.tsx` (Ask SuCasa),
  `campaigns-workspace.tsx`, `agent-continuation-card.tsx`, `business-shell.tsx`,
  the `ui-kit` cards, Drawer/Dialog primitives.
- The daily-ranking and card/brief patterns already proven on the lender side
  (`lender-daily.ts`, `lender-today.tsx`, `lender-contact-card.tsx`,
  `lender-brief.tsx`) — generalized rather than duplicated.

## I. Files to modify or add

Email
- `src/lib/email-templates/brand.tsx` — new light header using the hosted SuCasa logo.
- `src/lib/email-templates/agent-invite.tsx` — new hierarchy, benefits, sponsorship line.
- `src/lib/network.functions.ts` — invite link points at `/agent-invite?c=<id>`; pass
  sponsorship context.

Invitation and activation
- `src/routes/agent-invite.tsx` (new, public) — landing page + activation flow.
- `src/lib/agent-onboarding.functions.ts` (new) — `ensureAgentWorkspace`,
  `acceptAgentInviteAsNewAgent`, `getInvitePreview` (public, returns only lender name).
- `src/lib/network.server.ts` — reuse `respondToInvite`; add a public-safe invite lookup.

Agent daily experience
- `src/components/agent-today.tsx` (new) — hero summary, Your Best Move, Next up,
  contact list, compact strip; composed from existing data.
- `src/components/agent-contact-card.tsx`, `src/components/agent-brief.tsx` (new,
  generalized from the lender equivalents).
- `src/lib/agent-daily.ts` (new, pure presentation logic: grouping, headline, ordering)
  with unit tests.
- `src/routes/_authenticated/agent/index.tsx` — render the new Today.
- `src/components/business-dashboard.tsx` — agent branch trimmed to the compact strip
  and campaigns summary; lender branch untouched.
- `src/components/onboarding-walkthrough.tsx` — reused for the four-moment value tour.

No schema changes. No changes to access gates, consent, ranking or compliance logic.

## J. Conflicts and judgment calls

- **Shared dashboard component.** `business-dashboard.tsx` currently serves both agent
  and lender. I'll branch by role rather than fork it, so the lender experience is
  untouched.
- **"Activated" counts.** Relabelling to "Connected homeowners" is a wording change
  only; the underlying credit/activation logic stays.
- **Preview content on a public page.** The invitation page must not show real
  homeowner data before sign-in, so its product previews use illustrative examples.
- **Sponsorship display.** Shown in Network and once on the invitation; deliberately not
  in the agent's daily surfaces so the lender doesn't dominate the agent's workspace.
- **Signals language.** All predictive wording stays hedged ("potential", "signal",
  "may") with existing estimate disclaimers.

## Current agent UI I recommend condensing rather than restyling

- The five-tile KPI grid → one compact strip below the action content.
- The separate "Today" and "Opportunities" card sections → one prioritized list.
- The standalone Tasks surface → folded into the same list, with the route kept as a
  redirect so existing links keep working.
- Duplicate campaign blocks → a single one-line summary with a link.
