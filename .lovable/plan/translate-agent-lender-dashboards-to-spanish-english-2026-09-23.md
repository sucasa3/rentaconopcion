# Translate Agent & Lender Dashboards to Spanish/English

## Goal
Make the agent and lender dashboard interiors fully bilingual (English + Spanish) using the existing homeowner i18n system, without touching any home address, property, or financial data.

## Scope decided
- Translate **all** agent and lender authenticated screens.
- Language follows the existing `profiles.language` field, controlled from the Account page (`en` | `es`).
- Out of scope: homeowner-only strings (already done), marketing emails, any backend logic or data model changes.

## Why this is safe for address data
- The i18n layer only replaces **display strings** (labels, headings, button text, empty states, error copy).
- Address, value, equity, and other record values are rendered from database rows and are **not translated**.
- No string is used to compute or modify data, so adding/removing dictionary keys cannot corrupt stored records.

## Work breakdown

### 1. Inventory and dictionary keys (read-only first)
- Walk every file in `src/routes/_authenticated/agent/` and `src/routes/_authenticated/lender/`.
- Collect every user-facing English string into new dictionary namespaces: `agent.*`, `lender.*`, and shared components where needed.
- Group keys by screen so missing translations are easy to spot.

### 2. Spanish translations
- Add matching keys to `src/lib/i18n/es.ts`.
- Keep Spanish copy neutral/professional and consistent with the existing homeowner Spanish voice.
- Leave English as the fallback if a key is missing.

### 3. Refactor agent screens
- Replace hardcoded strings in `src/routes/_authenticated/agent/*` with the `useT()` hook from the existing i18n context.
- Keep dynamic data (names, addresses, dollar amounts, dates) as interpolated variables, not translated text.

### 4. Refactor lender screens
- Same as step 3 for `src/routes/_authenticated/lender/*`.

### 5. Shared UI and account language
- Confirm the Account page language toggle already updates `profiles.language` and that agent/lender routes read it through `LanguageProvider`.
- Add any missing shared strings for agent/lender-specific navigation or menus.

### 6. Tests
- Add dictionary key-coverage tests so a missing Spanish key fails the suite before it reaches the UI.
- Add a regression test asserting that an address value rendered in the UI is passed through unchanged regardless of language.
- Run existing test suite to catch accidental breakage.

### 7. Verification
- Type check, production build, and authenticated smoke tests for both languages on agent and lender routes.
- No publish. No Stage 4 work.

## Deliverable
A preview build where agents and lenders can switch language on their Account page and see their entire dashboard in Spanish, with all underlying data intact.
