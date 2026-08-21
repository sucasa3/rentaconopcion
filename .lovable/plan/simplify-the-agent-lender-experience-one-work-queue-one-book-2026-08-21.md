# Simplify the agent & lender experience: one work queue, one book

You're right — Dashboard, Tasks and Opportunities are three views of the same underlying signals. Today an opportunity for "Jose Munoz" shows up as a Today card on the Dashboard, as a row in Opportunities, and as a derived task in Tasks. Three places to check, three chances to feel behind.

## The idea

Collapse them into **two** places:

```text
BEFORE                          AFTER
Dashboard   ─┐                  Today      (one work queue + numbers)
Tasks       ─┼─ same signals    Homeowners (the book, searchable)
Opportunities┘                  Marketing
Homeowners                      Network
Marketing
Network
```

- **Today** — the only "what do I do now" screen. A single prioritized list of things to act on (strong signals first, then intros, then setup items like sender branding), each one checkable/dismissable exactly like today's Tasks. The five stat tiles stay at the top as the at-a-glance numbers, and campaigns get a compact strip at the bottom.
- **Homeowners** — unchanged in purpose: the full book with Priority Queue / Opportunities / Client Book tabs already built there. This is where you go to *browse*; Today is where you go to *work*.

Net effect: nav drops from 6 items to 4, and every actionable item lives in exactly one list.

## What changes

1. **Nav**: remove "Tasks" and "Opportunities" from sidebar and mobile tab bar. Rename "Dashboard" to "Today". Order: Today, Homeowners, Marketing, Network.
2. **Today screen** (rebuilt from the current dashboard):
   - Stat tiles stay, but "Tasks due" and "Opportunities" tiles both scroll to the queue instead of linking to separate pages.
   - The "Today" and "Opportunities" card sections are replaced by one **Work queue**: the derived task list, grouped as "Now" and "Later", with a "Done" collapsible section.
   - Each row keeps one clear action ("View homeowner") plus a check-off control.
   - Marketing section shrinks to a one-line summary with a link.
3. **Old routes keep working**: `/agent/tasks`, `/lender/tasks`, `/agent/opportunities`, `/lender/opportunities` redirect to the dashboard (existing deep links from tasks, emails and the decks won't break).
4. **Opportunities browsing** stays available inside the Homeowners workspace tab that already exists, so nothing is lost — only the duplicate top-level entry point goes away.

## Technical notes

- `src/components/business-shell.tsx` — trim `navItems`, rename Dashboard → Today.
- `src/components/business-dashboard.tsx` — replace the "Today" and "Opportunities" sections with the task queue rendered from `getMyBusinessTasks`; keep `StatCard` grid and shrink the campaigns block.
- Reuse the existing queue rendering from `TasksWorkspace` rather than writing a second list component; extract it into a shared component so both the Today screen and (if kept) the standalone route render identically.
- `src/routes/_authenticated/{agent,lender}/tasks.tsx` and `opportunities.tsx` become redirect routes (`beforeLoad` → `redirect`).
- No server-function, schema or signal-logic changes: `tasks.server.ts`, `business.functions.ts` and the opportunity engine stay exactly as they are.
