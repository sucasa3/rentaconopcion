# Where the logo, account and sign out went — and how to bring them back

## What's happening now

On desktop, the new app shell shows a left sidebar with the SuCasa logo at the top and "Sign out" (plus "My home" for pros) at the bottom. On a phone that sidebar is hidden, and the mobile bottom tab bar only holds navigation items. So on mobile there is currently no logo, no account info, and no way to sign out — which is what you're seeing on `/lender` at 393px.

## The fix: an iOS-style top bar plus an account sheet

### 1. Mobile top bar (both shells)
A slim sticky header, mobile only, above the page content:
- Left: SuCasa logo (taps to home).
- Right: circular avatar button with the user's initials.

### 2. Account sheet
Tapping the avatar opens a bottom sheet (iOS style, slides up) containing:
- Name, email, and role label (Homeowner / Agent / Lender).
- "My home" link for pros.
- Settings-style rows for anything account-level we already have.
- "Sign out" as the last, clearly separated row.

### 3. Desktop parity
On desktop the same avatar + name block sits at the bottom of the sidebar, opening the same menu, replacing the bare "Sign out" button so account info is visible in both layouts.

## Verification
Check `/lender`, `/agent` and `/dashboard` at 393px: logo visible, avatar opens the sheet, sign out returns to the public homepage.

## Technical notes
- New `src/components/account-menu.tsx` (avatar + sheet, reads the session via the existing Supabase client) and a small shared mobile top bar.
- Used by both `src/components/business-shell.tsx` and `src/components/homeowner-shell.tsx`.
- Presentation only: no schema, query, or server-function changes.
