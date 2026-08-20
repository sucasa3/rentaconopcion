# Homeowner dashboard: a short summary screen, not everything at once

Today the dashboard is one continuous page about 8,300px tall on a phone — hero, next step, the full home-care list, recommended pros, documents, inspection findings, signals, home intel tiles, equity, assistant, service requests, report link and seller intent, all expanded. That is what makes it feel confusing.

The fix: keep the photo Hero card exactly as it is, then show a small set of summary cards. Each card = one icon, one headline number, one plain sentence, one button. Everything else lives behind that button.

## What stays, what moves, what goes

Stays on the dashboard:
- Hero card (address, Home Score ring, value, equity, projection slider) — untouched.
- One "next step" line — folded into the top summary card instead of its own big block.
- 3-4 summary cards: Home care, Documents, Money (value & equity), Home Assistant.

Moves behind a button (same components, just not rendered on the dashboard):
- Full maintenance list + recommended pros → Home care section.
- Document list + inspection findings → Documents section.
- Home intel tiles, equity & mortgage detail, home signals → Money section.
- Recent service requests → Services (already a tab).

Removed from the homeowner dashboard:
- Seller intent card (moves into the Money section, where selling context belongs).
- Home Intelligence Report promo block (the Report bottom-tab already goes there).
- Duplicate "Setup guide / Take the tour" pair in the greeting row — keep one.

## Three visual options

**Option A — Stacked story cards (recommended)**
Hero, then four full-width cards in priority order, tallest first. The top card is whatever needs attention (usually Home care) and is visually louder: colored left edge, big count ("2 things are late"), and a primary button. The other three are quieter, same shape, smaller. Reads top-to-bottom like a to-do list. Best for one-handed phone use; least visual noise.

**Option B — 2x2 tile grid**
Hero, then four equal tiles two-across (single column on very narrow phones). Each tile: icon badge, big number, one short line, tap anywhere to open. A thin "needs attention" bar sits above the grid when something is late. Most glanceable, most iOS-Home-app-like, but each tile holds less text.

**Option C — One focus card + three chips**
Hero, then a single large "Here's what to do now" card with the one top item and its action button, followed by a row of three compact summary chips (Documents, Money, Assistant) that expand on tap. Most opinionated and calmest; hides more, so power users tap more.

All three keep the current palette (deep blue + growth green), rounded-3xl cards, soft shadows, gradient buttons, and the bottom tab bar.

## Card contents (same in every option)

| Card | Headline | Sentence | Button |
| --- | --- | --- | --- |
| Home care | count late / coming up | name of the top item in plain words | Open home care |
| Documents | number of documents | whether an inspection report has been read | Add a document |
| Money | estimated value | equity in dollars and % , refi note if present | See the numbers |
| Home Assistant | — | "Ask anything about your home" | Ask a question |

## Technical notes

- `src/routes/_authenticated/dashboard.tsx` renders only Hero + the summary cards; the heavy panels move into three routes (`/dashboard/care`, `/dashboard/documents`, `/dashboard/money`) under `_authenticated`, so the existing panel components are reused unchanged and the bottom tab bar links to real pages instead of scroll anchors.
- Summary numbers come from the data already loaded by `useHomeRecord` / `useHomeIntel` — no new queries and no extra property-record spend.
- A new `SummaryCard` primitive in `src/components/ui-kit/index.tsx` covers all three options; switching option later is a layout change, not a rewrite.
- `HomeHero`, `HomeAssistantCard`, `HomeCarePanel`, `DocumentsCard`, `HomeIntelPanel`, `EquityMortgagePanel` are not restyled.

## To confirm

Which option (A, B or C) should I build? I can also build A and show it, then adjust toward B or C if it doesn't feel right.
