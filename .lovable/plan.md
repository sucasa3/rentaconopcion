# Lender landing: MLOs go straight to their book, managers see the roster

## Recommendation

The **organization is the billing unit** (a solo MLO's own org, or a branch/team), and everyone inside it is either a **manager** or an **MLO**. That role already exists on lender org membership (`owner` / `member`), so nothing new needs to be invented and billing stays one subscription per org.

The rule:

- **MLO (member)** — signing in goes straight into their book, the page you're on now. No org list, no create-portfolio form.
- **Manager (owner)** — signing in lands on the roster page: their org, all books grouped by loan officer, plus team tools.
- **Admin** — unchanged, sees everything.

## One book per MLO — yes

Keep it one portfolio per MLO. "Your clients" is a single list; if a manager wants to slice it (Q3 refi, past clients), that's a filter or tag inside the book, not a second book. This keeps the MLO experience one page, keeps billing per seat rather than per list, and keeps the manager roster a simple one-row-per-officer view. A manager may still hold extra org-level books (e.g. an unassigned/house account), and admins can create more if a real need shows up later.

## Billing: two packages, same plumbing

| | Solo MLO | Team / Branch |
|---|---|---|
| Who buys | An individual loan officer | A manager for their officers |
| Org | Auto-created on signup, named after them | Created by the manager |
| Seats | 1 (themselves, as owner) | Manager + N officers |
| Price | Flat monthly, one seat | Per-seat monthly, volume tiers |
| Lands on | Their book | Roster of officers |
| Campaigns | Their own branding | Org branding, manager can lock or let officers override |

A solo MLO upgrading to a team never migrates data — they already own an org, so a manager seat and extra officers just get added to it. Billing reads one number: active member count on the org.

Implementation-wise this is one field on the org (`plan`, already present) plus a seat count; no second product model, no separate solo/team codepaths.

## Layout: tabs at the top of the book

Yes — move campaigns and client import out of the page flow into a slim tab bar under the page title on the portfolio page:

```text
Acme Mortgage · Maria's book
[ Clients ]  [ Campaigns ]  [ Import ]            ← sticky tab row
─────────────────────────────────────────
(clients table / campaigns workspace / import panel)
```

- **Clients** — today's portfolio table, the default tab.
- **Campaigns** — the existing campaigns workspace, scoped to this book instead of a separate `/lender/campaigns` page.
- **Import** — add a client and CSV/roster import, which today sit on the list page where an MLO can't reach them.

For managers, the roster page keeps its own light tabs: **Officers** (books grouped by loan officer) and **Team settings** (branding, seats, campaign defaults). Tabs are real routes so they're linkable and back-button friendly.

## Technical notes

- Reuse `lender_members.role` (`owner`/`member`); `listMyPortfolios` already returns the caller's role per org.
- Migration: `lender_portfolios.assigned_user_id uuid references auth.users(id)` (nullable, indexed) + a partial unique index so a member holds at most one assigned book. `lender_orgs.plan` already exists; add `seat_limit int` for team plans.
- Routes: `/lender/portfolio/$id` becomes a layout with `index` (clients), `campaigns`, and `import` children; `/lender/campaigns` redirects into the manager view.
- New server fn `assignPortfolioOwner` (owner/admin only); `listMyPortfolios` gains a member branch returning only the caller's assigned book.
- `/lender/` redirects members to their book client-side after the query resolves (subtree is `ssr: false`).
- Billing enforcement is a seat check on member add — no payment provider work in this plan.
