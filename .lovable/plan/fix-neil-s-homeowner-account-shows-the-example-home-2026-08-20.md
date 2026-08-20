# Fix: Neil's homeowner account shows the example home

## What's actually happening

Two separate things, and only one of them is a data problem.

1. The homeowner profile for `neilterc@hotmail.com` (Neil Terc) has **no address at all** — street, city, state and ZIP are all empty. The account signed in this morning, so this is the live account he's looking at.
2. The dashboard doesn't handle "no address" gracefully. When there's no address and no property intel, it falls back to the built-in demo home used on the marketing page — `123 Main St, Austin`, $482,300 value, 39% equity, home score 82. So instead of an empty state, Neil sees a fake home that looks real.

The Gunstock address does exist in the system: `2138 Gunstock Dr, Stone Mountain, GA 30087` is saved on two other test homeowner profiles (Johnny Garcia, Sandra Davis), and property records for it are already cached (valuation and property detail pulled Aug 6). It was simply never attached to Neil's own account.

## Fix

1. **Attach the real home to his account** — set address `2138 Gunstock Dr`, city `Stone Mountain`, state `GA`, ZIP `30087` on Neil's profile, then let the dashboard pull records. Since that address is already cached, value/equity/details should fill in immediately with no new lookup spend.
2. **Never show the demo home to a signed-in homeowner.** Remove the marketing fallback from the homeowner dashboard: when there's no address, or no value on record, show the "Finish your address" card and blank/placeholder figures instead of Austin numbers, a fake score and fake system statuses.
3. **Same for the score and system dots** — the roof/HVAC/plumbing/electrical statuses and the home score currently fall back to the demo values too. With no real record they should read as "not enough info yet" rather than green/amber lights for someone else's house.

## Technical notes

- `src/routes/_authenticated/dashboard.tsx` builds `heroData` by spreading `HOME_HERO` from `src/lib/home-hero-data.ts` and only overriding fields when real data exists. Replace with an explicit "no data" hero state: `value`, `equity`, `equityPct`, `homeScore`, `zones` become nullable and the hero renders dashes/skeleton.
- `src/components/home-hero/HomeHero.tsx` needs to accept those nullable fields and hide the projection slider / ROI line when there's no value.
- `HOME_HERO` stays as the marketing-page sample only; it should no longer be imported by any authenticated route.
- The address correction for Neil's profile is a one-row data update, not a schema change.

## Please confirm

Is `2138 Gunstock Dr, Stone Mountain, GA 30087` the exact address for his home? That's the Gunstock property already in the system — if his is a different house number on that street, tell me and I'll use that instead.
