# Spanish for homeowners: comms + key screens

## What happens today when someone picks "Spanish"

The choice is saved on the homeowner's profile and pushed to the CRM as a `sucasa_language` field. From there:

Already Spanish:
- Home assistant replies
- Inspection-report finding summaries
- Campaign email copy generated for that homeowner
- Agent client briefs (when requested in Spanish)

Still English:
- Every screen in the app — nav, buttons, labels, headings, status lines, tasks, heroes
- System emails (welcome, password reset, magic link, email change)
- Onboarding itself (they pick Spanish in an English form)

There is also no way to change the language after onboarding — it is set once and never editable.

## What we build

### 1. Language plumbing
- A small translation layer with a dictionary per language (`en`, `es`) and a `useLanguage()` hook that reads the homeowner's saved preference, falls back to the browser language on first visit, and re-renders instantly when changed.
- No page reload, no separate `/es` URLs.

### 2. Language switcher
- Add "Language" to the account menu and to a new homeowner profile section, so a homeowner can switch at any time. Saving updates the profile and the CRM field.
- Onboarding asks for the language on step 1 and immediately switches the rest of onboarding into that language.

### 3. Screens translated (homeowner-facing only)
- Onboarding (all steps)
- Dashboard summary
- Home care
- Documents
- Money / equity
- Assistant
- Service request flow
- Shared shell: bottom tabs, account menu, sign-out, empty states, error and loading text
- Public homepage, Home Services and Professional Partner pages get a language toggle too, since that is where a Spanish-speaking homeowner first lands.

Agent, lender and admin dashboards stay English — those are professional users and translating them is a separate project.

### 4. Emails
- System auth emails (signup, magic link, recovery, email change, invite) get a Spanish version, selected from the profile language.
- Campaign emails already generate Spanish body copy; we also translate the surrounding template chrome (greeting, footer, unsubscribe line) and the CTA label.

### 5. Dynamic content
- Maintenance task names, home-score explanations and next-step suggestions are generated from rules, not typed by a human, so each rule gets both an English and Spanish string.
- Anything written by a partner (their own campaign intro/closing overrides) stays exactly as they wrote it — we never machine-translate a partner's own words.

## Technical notes

- Dictionary modules under `src/lib/i18n/` (`en.ts`, `es.ts`) with a typed key union so a missing translation is a build error, plus a `LanguageProvider` in `src/routes/__root.tsx`. No i18n library dependency needed at this size.
- Preference resolution order: profile `language` → `localStorage` → browser → `en`. Read after hydration to avoid a server/client mismatch.
- Maintenance rules (`src/lib/maintenance-rules.ts`, `src/lib/seasonal-tasks.ts`, `src/lib/next-step.ts`) change from literal strings to translation keys.
- Auth email templates in `src/lib/email-templates/` take a `language` prop; the webhook resolves it from the profile before rendering.
- `src/lib/campaigns-run.server.ts` already reads `profiles.language`; extend the template wrapper in `src/lib/campaigns.server.ts` for chrome and CTA.
- No database change required — `profiles.language` and `pros.language` already exist.

## Suggested order

1. Plumbing + switcher + onboarding (makes the setting real and reversible)
2. Homeowner app screens
3. Maintenance/next-step rule strings
4. Emails
5. Public marketing pages
