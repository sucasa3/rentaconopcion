# Fix the Home / Home care / Documents tabs feeling slow and jumping to the top

## What's happening

Those three tabs aren't really tabs today — each tap runs a full router navigation to `/dashboard?tab=...`. Two side effects come from that:

- **It scrolls to the top.** The router treats every tap as a new page visit and restores scroll to the top of the document, so you lose your place instead of just swapping the panel below the tab bar.
- **It feels unresponsive.** The tab highlight only moves once the navigation commits and the whole dashboard (hero, score, signals, panels) re-renders, so on mobile there's a visible lag between the tap and any feedback.

## The fix

1. **Switch instantly, sync the URL after.** Hold the active tab in local state so the highlight and panel change on the same frame as the tap. Update the URL in the background as a replace-style navigation that does not reset scroll, so `?tab=care` links and the back button keep working exactly as they do now.
2. **Stop the scroll jump.** Tell the router not to reset scroll for these tab changes. The one place that *should* scroll — the "Next step" hero jumping down into a tab — keeps its explicit smooth scroll.
3. **Keep the tap target honest on mobile.** Give each tab trigger a full-height, minimum 44px touch area so taps near the edge of the pill register the first time.
4. **Don't rebuild the page on every switch.** The panels for the inactive tabs stay mounted rather than being torn down and refetched, so returning to a tab is instant and no data re-loads.

## Technical notes

- `src/routes/_authenticated/dashboard.tsx`: replace the `setTab` that calls `navigate({ to: "/dashboard", search: { tab } })` with local `useState` seeded from `Route.useSearch()`, synced back to the URL via `navigate({ search, replace: true, resetScroll: false })`. Keep an effect syncing state when the search param changes externally (deep links, sidebar/bottom-nav links).
- Same file: add `min-h-11` sizing to the three `TabsTrigger`s.
- Existing `?tab=care` / `?tab=documents` links in `src/components/homeowner-shell.tsx` continue to work unchanged.
- Presentation only — no data, server function, or schema changes.
