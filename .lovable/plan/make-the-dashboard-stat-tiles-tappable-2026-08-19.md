# Make the dashboard stat tiles tappable

The four tiles at the top of the agent/lender dashboard (Homeowners, Activated, Opportunities, Campaigns) are currently display-only. Users expect them to be the fastest way into each section, so each becomes a link.

## Where each tile goes

| Tile | Destination |
| --- | --- |
| Homeowners | The homeowner/client list for the book |
| Activated | Same list, pre-filtered to activated homeowners |
| Opportunities | The Opportunities page for that role |
| Campaigns | The Marketing/Campaigns page for that role |

Agent tiles route to the agent versions of those pages, lender tiles to the lender versions. If the user has no book yet, the two list tiles stay non-clickable instead of leading to a dead route.

## Feel

- Tiles get a pointer cursor, a subtle hover lift and the existing press-scale so it's obvious they're tappable.
- A small chevron appears on tiles that link, so an unlinked tile doesn't look broken.
- Keyboard focus ring and accessible label ("Homeowners, 76") so it reads correctly on screen readers.

## Technical notes

- `StatCard` in `src/components/ui-kit/index.tsx` already supports `to`/`params`/`search`; wire those through from `src/components/business-dashboard.tsx` and add the hover/focus/chevron affordances to the linked variant.
- Add an optional `status` search param to the agent portfolio route (`portfolio.$id.tsx`, which already has `validateSearch` for `client`) and to the lender portfolio index, defaulting the existing client filter to activated-only when `status=activated`.
- No data or server-function changes; counts already come from `getBusinessOverview`.
