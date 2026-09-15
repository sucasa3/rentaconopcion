# Remove the "Edit with Lovable" badge

## What
Hide the Lovable "Edit with Lovable" badge from the public SuCasa site.

## Steps
1. Check current badge visibility with `publish_settings--get_badge_visibility`.
2. If visible, call `publish_settings--set_badge_visibility` with `hide_badge: true`.
3. The change applies to the published deployment automatically; no code edits are needed.

## Scope
This removes the badge from the public-facing site only. The Lovable editor and preview surfaces keep their normal UI controls.
