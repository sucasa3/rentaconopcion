# Lean Agent and Lender Spanish Translation

## Read-only inventory

- **Agent:** 20 remaining route/component files with visible English: 8 authenticated screens and 12 directly connected interface components.
- **Lender:** 27 remaining route/component files with visible English: 11 authenticated screens and 16 directly connected interface components.
- **Overlap:** several shared files serve both roles, so the unique implementation total is lower than 47.
- **Estimated visible copy:** approximately **600–700 distinct strings** after removing duplicates and excluding metadata, code-only values, and dynamic content.

### Shared components involved

- Business navigation and account menu
- Daily Read preference
- Guided onboarding
- Campaign workspace, branding controls, preview, and override dialogs
- Bulk client upload
- Copilot search
- Funnel chart
- Task/action queue surfaces
- Shared status, contact-action, and account/preferences panels used within these dashboards

Dynamic names, addresses, company names, financial/property values, database records, IDs, raw provider values, canonical reasons, and AI-generated content remain unchanged.

## Proposed implementation batches

### Batch 1 — Shared shell and highest-use screens
- Extend the existing English and Spanish dictionaries.
- Translate shared navigation, account controls, preferences, dialogs, and common workspaces.
- Translate Agent Today and Lender Today.
- Translate primary homeowner/client detail and My Book views.

### Batch 2 — Core workflows
- Agent: portfolio/monitored relationships, tasks/follow-up, campaigns, and funnel.
- Lender: Discovery, campaigns, funnel, and related import/detail surfaces.
- Reuse only the existing `useT()` / `useLanguage()` pattern.

### Batch 3 — Remaining professional screens and verification
- Agent: network, home teams, reveal/add-client, and remaining authenticated screens.
- Lender: network, capacity, billing, and remaining authenticated screens.
- Add dictionary-key coverage and address-preservation regression tests.
- Run the full test suite, type check, production build, and authenticated English/Spanish smoke checks in preview.

## Guardrails

- UI copy only; no product-functionality, data-model, permission, consent, campaign, workflow, ranking, Today-logic, provider, or API changes.
- No parser, extraction engine, runtime auto-translation component, or new localization framework.
- No screen redesign and no unrelated refactoring.
- No publish without separate approval.
