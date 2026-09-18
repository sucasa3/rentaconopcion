# Spanish: public pages + critical system emails

Scope approved: translate the public acquisition surface and critical system emails into Spanish. Agent/lender dashboards and presentations stay English-only. The homeowner app is already bilingual — no changes there.

## 1. Public pages (English ↔ Spanish)

Add a language toggle to the site header (desktop + mobile) so any visitor can switch instantly, no account needed. The choice already persists via the existing language layer (`localStorage` + browser fallback), so it works for anonymous visitors.

Translated via the existing i18n dictionary (extend `src/lib/i18n/en.ts` / `es.ts`):

- Homepage `/`
- `/agents` and `/agents/pricing`
- `/lenders` and `/lenders/pricing`
- `/pricing` role gateway
- Site header + footer (nav labels, CTAs, footer columns)
- `/services` and `/partner` (part of the public funnel)

Not translated (stays English): agent/lender dashboards, `/agents/deck`, `/lenders/deck`, `/agent-start` and `/lender-start` signup flows get Spanish too **only if trivial** — flag at build time; otherwise they stay English this phase.

## 2. SEO for bilingual public pages

- `<html lang>` updates with the toggle (already handled by the language layer).
- Each public page keeps one URL (no `/es` duplicates); `og:` metadata stays English to avoid duplicate-content issues.
- Verified: no canonical/hreflang changes needed since content swaps client-side on the same URL.

## 3. Critical system emails

Spanish versions selected from the recipient's saved profile language (fall back to English):

- Welcome / signup confirmation
- Magic link (sign-in)
- Password recovery
- Email change confirmation

Implementation: templates in `src/lib/email-templates/` take a `language` prop (pattern already proven in campaign emails); the auth-email webhook resolves the profile language before rendering. If no profile exists yet (brand-new signup), default English.

## 4. Guardrails

- No new marketing sections; translation only — page structure, CTAs, and the approved short-page design stay identical.
- No machine-translation of partner-written copy.
- Existing homeowner bilingual experience untouched.
- Professional dashboards and decks remain English.

## Technical notes

- Extend `en.ts`/`es.ts` with new key groups (`public.home.*`, `public.agents.*`, `public.lenders.*`, `public.pricing.*`, `public.nav.*`); missing keys are a build error (typed union already enforced).
- Add `<LanguageSwitcher />` (compact variant) to `site-header.tsx`.
- Pages listed above swap hardcoded strings for `t()` calls; pricing values stay sourced from `public-plans.ts`.
- Email templates: add `language` prop and `es` copy for signup, magic-link, recovery, email-change; webhook looks up `profiles.language`.

## Verification

- Toggle every public page at 390px and 1280px in Spanish: no overflow, no untranslated strings, CTAs unchanged.
- Render each system email in both languages; confirm correct language picked from profile.
- Typecheck + full test suite; existing 289 tests must stay green.
