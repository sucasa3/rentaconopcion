# Make the admin page reachable

## What's actually happening

Two separate things block you:

1. **The account you're using isn't an admin.** `neil@sucasa.com` (created today) only has the `homeowner` role. The admin role sits on `neilterc@hotmail.com` and `neil.yourcasa@gmail.com`. Recent sign-in attempts also failed with "invalid credentials", so the sign-in itself is failing before anything else.
2. **There is no link to the admin page anywhere.** `/admin` exists but the header nav lists only Services, For Pros, For Lenders, For Agents, Dashboard. The only way in today is typing the URL.

There is also no role check on `/admin` — any signed-in user who types the URL sees it. That should be closed at the same time.

## Plan

1. **Grant admin to your working account** — add the `admin` role to `neil@sucasa.com` so the account you actually log in with can reach it. (If you'd rather keep admin on `neilterc@hotmail.com`, say so and I'll reset that account's password instead.)
2. **Add an "Admin" link in the header** that appears only for users with the admin role, on both desktop and mobile menus.
3. **Gate the admin route by role**: check the caller's admin role on entry and redirect non-admins to the dashboard, so the page can't be reached by URL guessing.
4. Quietly fix the hydration warning currently showing on the sign-in page.

## Technical notes

- Role read via the existing `has_role(_user_id, _role)` security-definer function; add a small `useIsAdmin` hook (mirrors `use-user-id.ts`) for the header.
- Route gate goes in `src/routes/_authenticated/admin.tsx` `beforeLoad` (client-side, the parent `_authenticated` layout is already `ssr: false`).
- Role grant runs as a migration inserting into `public.user_roles`.
