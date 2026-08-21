# Make the client search bar easy to find

The AI client search exists, but it is buried. Today it only renders on the
Homeowners (client book) page, below the header, the stat tiles and the whole row
of segment filter chips — on a phone that is several screens down, so it looks
missing.

## What changes

1. **Put it on Today.** Add the "Ask about your clients" search bar near the top of
   the Today page (right under the greeting/stat tiles, above "What needs you"), so
   it's the first thing an agent or MLO sees when they log in. Tapping a result opens
   that client's detail page in their book.
2. **Move it up on the Homeowners page.** Render it directly under the page header,
   above the segment chips and the client table, instead of below them.
3. **Make it obvious what it is.** Keep the sparkle icon and Beta chip, and widen the
   placeholder to plain language: "Search a name, or ask — high intent clients with
   equity over $150k".
4. **Sticky on mobile is not added** — it stays a normal card so it doesn't cover the
   list while scrolling.

No change to how search works, what it can filter, cost controls or the monthly cap.

## Technical notes

- `src/components/business-dashboard.tsx`: render `<CopilotSearch>` after the stat
  tile grid, using the resolved `book` for `portfolioId` and a `detailPath` of
  `/{agent|lender}/portfolio/$id` with `search: { client: r.id }`. Hide it when the
  user has no book yet.
- `src/routes/_authenticated/lender/portfolio.$id.index.tsx` and
  `src/routes/_authenticated/agent/portfolio.$id.tsx`: move the existing
  `<CopilotSearch>` block above the segment/band filter `<section>`.
- `src/components/copilot-search.tsx`: placeholder copy only.
