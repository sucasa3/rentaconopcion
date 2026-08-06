# Lender landing: MLOs go straight to their book, managers see the roster

## Recommendation

Keep one concept — the **organization is the billing unit** (a branch or lender company), and everyone inside it is either a **manager** or an **MLO**. That membership role already exists on lender org membership (`owner` / `member`), so nothing new needs to be invented, and billing stays one invoice per org no matter how many MLOs are added.

The rule:

- **MLO (member)** — signing in goes straight into their own portfolio, the page you're on now. No org list, no create-portfolio form.
- **Manager (owner)** — signing in lands on the current list page: their org, all portfolios grouped by loan officer, plus campaigns and the create/import tools.
- **Admin** — unchanged, sees everything.

Why this stays simple long term:

- One switch (`owner` vs `member`) controls the whole experience — no separate accounts, sub-orgs, or per-seat plumbing.
- Billing never changes shape: the org is billed; adding an MLO adds a member, not a new customer.
- A manager can be given a book of their own too — if they also have a portfolio, they still land on the roster and click into it.

## What changes

1. **Landing behavior** — `/lender` decides where to send you:
   - member with exactly one portfolio → redirect into `/lender/portfolio/{id}`
   - member with several → a slim "your books" list (no create/import/org controls)
   - owner/admin → today's full page
2. **Portfolio ownership** — add an optional assigned loan officer on each portfolio so a member's "my book" is well defined and the manager view can group by MLO. Managers can assign/reassign from the list page.
3. **Manager list page** — portfolio cards grouped under the loan officer who owns them, with an "Unassigned" group; keeps campaigns, create, and import where they are.
4. **Portfolio page** — add a small back link that only shows for managers/admins, so MLOs never see a roster they shouldn't.

## Technical notes

- `lender_members.role` already stores `owner` / `member`; `listMyPortfolios` already returns the caller's role per org — reuse both rather than adding a new role type.
- Migration: `lender_portfolios.assigned_user_id uuid references auth.users(id)` (nullable), plus an index. Existing RLS stays org-scoped; members see the org's portfolios but the UI leads them to theirs.
- New server fn `assignPortfolioOwner` (owner/admin only) and a filtered branch in `listMyPortfolios` for members.
- Redirect happens client-side in the `/lender/` component after the portfolios query resolves (this subtree is `ssr: false`), so there's no prerender/auth issue.
