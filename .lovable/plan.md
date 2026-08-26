# SuCasa iOS App via Capacitor (App Store Path)

## Goal
Ship SuCasa to the Apple App Store by wrapping the existing mobile-first web app in a Capacitor native shell — reusing 100% of the current codebase, with native push notifications, camera document upload, and secure session storage.

## How it works
The web app stays exactly as-is (built and deployed by Lovable). A thin native shell loads the published SuCasa URL, so every web update ships instantly without App Store review. Native plugins add device capabilities the browser can't provide.

```text
Lovable (web app, sucasa.com)  <--loads--  Capacitor iOS shell (App Store app)
        |                                         |
   All features/UI                          Push notifications
   Home Record, dashboards                  Camera document upload
   AI assistant, Home Plan                  Face ID / secure storage
```

## Phase 1 — Web prep (done here in Lovable)
1. **PWA-grade polish** so the app feels native inside the shell: app manifest, app icons (1024px), splash screen assets, safe-area insets (notch/home indicator), `apple-mobile-web-app-capable` meta, standalone display detection.
2. **Deep-link & auth hardening**: ensure auth callbacks and magic links work when opened inside the Capacitor WebView (universal link handling, session persistence via Capacitor Preferences instead of localStorage fallback).
3. **Native-bridge hooks**: a small `native.ts` util that detects Capacitor and no-ops on web, so native features degrade gracefully in the browser.

## Phase 2 — Capacitor shell (exported to your machine / GitHub)
This step happens outside Lovable — you export the project (GitHub integration or download) and on a Mac:
1. `npm install @capacitor/core @capacitor/ios @capacitor/cli`
2. `npx cap init` pointing the webDir at the built app (or configuring the shell to load the live published URL directly — recommended, so updates are instant)
3. `npx cap add ios`, open in Xcode, set bundle ID (`com.sucasa.app`), signing team, version.

## Phase 3 — Native features worth adding for SuCasa
- **Push notifications** (`@capacitor/push-notifications` + APNs): maintenance alerts, campaign replies, opportunity HOT signals for agents/lenders. Requires wiring a push token table in the backend and a send path (can reuse existing notify.sucasa.com email infra's trigger points).
- **Camera/document capture** (`@capacitor/camera`): homeowners photograph inspection reports and permits straight into Home Care Documents — big win for the AI document intelligence flow.
- **Face ID / Touch ID** (`capacitor-native-biometric`) for fast re-entry.
- **Haptics** on task completion (supports the iOS feel; gamification-safe, just tactile feedback).

## Phase 4 — App Store submission (you + Apple)
- Apple Developer account: **$99/year** (required, in your company's name).
- App Store listing: screenshots (6.7" and 5.5" required), description, keywords, privacy nutrition labels (SuCasa collects financial/home data — needs accurate disclosure), privacy policy URL.
- App Review: ~24–48h. Because the shell loads remote content, the app must be functional and valuable on first open (it is — login → dashboard).
- Guideline watchouts: 4.2 (minimum functionality — fine, SuCasa is a real service), 5.1.1 (account deletion option — **we should add in-app account deletion before submission**, Apple rejects without it).

## What I need from you / decisions
1. **Apple Developer account** — do you have one already ($99/yr)?
2. **A Mac with Xcode** for building/submitting (or a CI service like Capacitor's or Codemagic).
3. **Priority of Phase 3 features** — my recommendation: push notifications first (retention), camera upload second (data flywheel).
4. **Account deletion flow** — add before submission (Phase 1 item); confirm and I'll include it.

## Technical notes
- No changes to the database, backend functions, or existing web behavior; all Phase 1 work is additive (manifest, icons, safe-area CSS, native-detection util, auth callback compatibility, account deletion).
- The Capacitor shell repo can live in the same GitHub repo (`ios/` folder) — Lovable syncs it, builds happen on your Mac/CI.
- Update cadence: web changes deploy instantly via Lovable publish; only native-plugin changes need a new App Store build.
