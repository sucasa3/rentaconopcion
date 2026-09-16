# Lender landing page at /lenders — plus what happens when two agents upload the same homeowner

## Part 1 — The public lender page

Today `/lenders` is the private 19-slide partnership deck (noindex). Mirror exactly what we just did for agents:

- `/lenders` becomes the public, indexable landing page.
- `/lenders/deck` keeps the existing deck untouched, including its PDF/print mode and keyboard navigation. All existing deck links keep working.

### Page structure (mobile-first, same design system as /agents)

1. **Hero** — "Your agents already have the customers. SuCasa helps them know who to call, and why." Primary action **Talk to us about a pilot**, secondary **View presentation**, plus a quiet **Sign in** for existing loan officers.
2. **Product proof, high on the page** — a compact, clearly labeled "ILLUSTRATIVE DEMO" card in the real lender product language: a homeowner whose circumstances changed, why now, what the loan officer could say, and the next step. Every name and number fictional.
3. **The problem** — databases full of homeowners, no way to tell which matter today; budget goes to buying new leads instead of activating existing ones.
4. **The flow** — agent database → homeowner signals → agent has a reason to reach out → a conversation happens → a financing need emerges → your loan officer gets the opportunity.
5. **Focus, not volume** — the deck's 1,000 → 37 illustrative framing, labeled illustrative and not a guaranteed result.
6. **What a loan officer actually gets** — a prioritized book, equity and mortgage-age context, annual-review moments, suggested language, branded outreach.
7. **Agent + lender flywheel** — the lender brings agents, agents bring homeowners, homeowners create financing conversations, and the agent keeps the relationship.
8. **Trust and boundaries** — the section that matters most for lenders: the homeowner controls their own permissions; an agent uploading a database gives a lender nothing automatically; lender visibility only exists where the homeowner consented; SuCasa is not a lead list and does not sell anyone's database.
9. **Is / is not** — straight from the deck, so expectations are set before a sales call.
10. **Pilot** — the 90-day pilot shape and success metrics, ending with the contact/pilot action.

### Messaging discipline (same rules as the agent page)

Signals, changes, and reasons to reconnect only. No claim that SuCasa predicts who will refinance, sell, move, or transact, and no guaranteed conversion. Every displayed homeowner, value, and equity figure is fictional and visibly labeled.

### Funnel tracking

Same first-party, PII-free ledger used for agents, with lender-specific events: landing view, pilot/contact clicked, deck viewed, pricing clicked, sign-in clicked. Non-blocking writes, no new vendor, sanitized referrer only.

### One decision needed

The lender page's main action: a **contact/pilot request form** (name, company, email, rough loan-officer count) that lands in the existing audit/notification path, or simply a **mailto/calendar link**? See the question below.

## Part 2 — Two agents, same homeowner: what actually happens

Verified against the current schema and code:

- **The property record is shared, once.** Property intelligence is keyed uniquely by normalized address, so the second agent's upload reuses the same record instead of triggering a second round of paid provider calls. That's the intended economics.
- **Each agent's client row is their own.** Portfolio client rows and relationship records are stored per organization with org-level visibility, so Agent A cannot see Agent B's copy, notes, activity, or that Agent B exists in the system at all.
- **Neither agent gains any access to the other's work, and neither gains homeowner access by uploading.** Consent records remain the only authority for who may see homeowner information.
- **Both agents will see the same underlying home facts and therefore similar signals** — because both are looking at the same house. Each sees it inside their own book, with their own history and their own suggested next step.
- **The one existing cross-agent guardrail** is representation: if the home is listed with another agent, the record is flagged and put in a quiet, value-only mode with no solicitation.
- **Capacity is counted per workspace.** The same home occupying a slot in two different agents' 100-profile allowances is worth confirming as intentional before launch.

### Open product gap worth naming now

Nothing today tells the homeowner "two professionals have you in their book," and nothing lets the homeowner choose which one is actually their agent. Long term the honest answer is the homeowner decides: whoever the homeowner confirms is their agent gets the confirmed relationship, and the other keeps a self-asserted, unconfirmed record. That is a separate piece of work, not part of this landing page.

## Technical notes

- Route split: `src/routes/lenders.tsx` becomes a layout with `lenders.index.tsx` (landing) and `lenders.deck.tsx` (existing deck moved verbatim, print link retargeted).
- Legacy IDX redirect rules get `/lenders` and `/lenders/deck` explicitly exempted, with a redirect test, matching the `/agents` treatment.
- Reuse `SiteHeader`/`SiteFooter`, existing semantic tokens, and the deck's product-frame patterns; no marketing-only color or font additions.
- Header/footer gain the public "For Lenders" link; lender pricing CTAs point at the new page's action.
- Landing route gets its own title, description, OG/Twitter text, canonical `https://sucasa.com/lenders`, and `index,follow`; the deck route stays noindex.
- New funnel actions appended to the existing event action union; no schema change.
