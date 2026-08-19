# Homeowner dashboard: the "5th grader" version

Goal: someone should understand this screen in 5 seconds without reading anything twice. Same deep blue + green look, same data — much plainer words, bigger visuals, fewer things on screen at once.

## The big idea

Three plain-language blocks stacked on one scrolling page, each with a big friendly headline and a picture-first summary:

```text
1. YOUR HOME            "Here's what your home is worth"
   Big number + a simple up/down line. One tap for details.

2. TAKE CARE OF THIS    "3 things need you"
   Red / yellow / green dots. One item per row, plain sentence.

3. YOUR PAPERS          "We're holding 6 papers for you"
   Big drop zone. Says what a paper does for them.
```

## What changes

**Plain words everywhere.** "Home care" becomes "Take care of this". "Documents" becomes "Your papers". "Systems / Routine" tags become "Big stuff" and "Quick job". "Overdue" becomes "Late". "Due soon" becomes "Coming up". No jargon like equity, readiness, signals, record — those move into the detail views with a one-line explanation.

**Traffic lights instead of numbers.** Every care item gets a colored dot: red = late, yellow = coming up, green = all good. The section headline just counts the red and yellow ones ("2 things are late, 1 is coming up"). No scores, badges, or percentages in the main list.

**One sentence per item.** Each row: what it is, why it matters in kid-plain language ("Your water heater is 14 years old. Most last about 12."), and one green button ("Mark it done" or "Get help").

**Show at most 4 things.** The list opens with the items that need attention plus one green one, then a big "See everything" button. Nothing else competes for attention.

**Bigger touch targets.** Rows become full-width tappable cards with a large icon tile, min 56px tall, generous spacing — thumb-friendly on the 393px screen.

**A friendly empty/greeting line.** Top of the page: "Hi Neil — your home looks okay today" or "Hi Neil — 2 things need you this week", set by the same urgency logic.

**Illustrated section headers.** Each of the three blocks gets a simple icon badge and one-line explainer instead of the current dense hero with chips and status text.

## What stays the same

Data, queries, routing, credits, scoring logic, and the existing scroll-anchor navigation all stay untouched. This is presentation only.

## Technical notes

- `src/components/section-hero.tsx`: add a simpler `plain` variant — big icon badge, headline, one explainer line, one primary action. Drop chips/status clutter for homeowner use.
- `src/components/home-care-panel.tsx`: keep the merged priority list built last turn; restyle rows as large tappable cards with a status dot, plain-language copy map for labels/reasons, and collapse to 4 items by default.
- `src/components/documents-card.tsx`: reword to "Your papers", lead with a large upload target and a one-line "why this helps" note.
- `src/routes/_authenticated/dashboard.tsx`: add the greeting line, reorder so "Take care of this" sits directly under the greeting (most actionable first), then papers, then home numbers.
- `src/components/homeowner-shell.tsx`: rename nav labels to match ("Home", "To do", "Papers").
- All colors via existing semantic tokens (destructive / accent / growth); no new hardcoded colors.
