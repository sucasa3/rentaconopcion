# SuCasa Mobile App — Phase 1: Installable + App-Store-Ready Web Foundation

## Goal
Make SuCasa installable on iPhone/Android home screens today (no Mac, no Apple account needed), and complete the web-side groundwork so a Capacitor App Store wrapper can be added later with zero rework.

## What gets built (all here in Lovable)

### 1. Installable app (PWA manifest, no offline caching)
- `public/manifest.webmanifest`: name "SuCasa", short_name, `display: "standalone"`, deep-blue theme/background colors, `start_url: /`.
- Generated app icons: 192px, 512px, and 180px Apple touch icon (SuCasa mark on brand background) under `public/`.
- Head tags in `__root.tsx`: manifest link, `theme-color`, `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, per-platform title.
- Result: "Add to Home Screen" on iOS/Android launches SuCasa full-screen with its own icon — looks and opens like a native app. No service worker, no offline mode (keeps preview safe and avoids stale-cache risk).

### 2. Native-feel polish
- Safe-area insets (notch / home indicator) applied to the mobile bottom-tab shells and fixed footers via `env(safe-area-inset-*)`.
- Prevent iOS rubber-band overscroll on fixed shells; tap-highlight cleanup; `-webkit-touch-callout` tuning on images.
- Splash background color matching the theme so launch has no white flash.

### 3. Account deletion (Apple App Store requirement 5.1.1)
- "Delete account" option in homeowner and professional settings with confirmation flow.
- Server function that deletes the user's data rows (respecting existing tables/RLS) and removes the auth user via the admin client, then signs out.
- This is mandatory for App Store review later and good practice regardless.

### 4. Native-ready utility
- `src/lib/native.ts`: tiny helper detecting a Capacitor WebView (`window.Capacitor`) with graceful web fallback — future push/camera/biometric plugins slot in without touching app logic.

## What comes later (not in this phase, documented for you)
- **Capacitor shell** (needs a Mac or CI + $99/yr Apple Developer account): `npx cap add ios`, point the shell at the published SuCasa URL, submit to App Store. The app then auto-updates with every Lovable publish.
- **Native plugins** once the shell exists: push notifications (alerts/opportunities), camera capture for inspection documents, Face ID.

## Technical notes
- No service worker is registered anywhere (per installability rules) — manifest-only. iOS/Android cache manifest fields at install time; icons/name are set correctly the first time.
- No database schema changes expected except deletion cleanup queries; no changes to existing features or dashboards.
