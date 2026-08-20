# Tasks for agents and lenders

Give business users the same "here's what needs doing, check it off, it goes away" experience homeowners get with maintenance — but generated automatically from the signals SuCasa already detects.

## What they'll see

A new **Tasks** item in the sidebar and mobile tab bar, opening a single scrolling list:

- **Due now** — tasks that need action today
- **Later** — lower-urgency items
- **Done** — collapsed, recently completed (with an undo)

Each task is one card: plain-language title, the homeowner it relates to, why it surfaced, and one primary button that jumps to the place where the work happens (opportunity, introduction, campaign approval, client record). A checkbox marks it complete and removes it from the list.

The business dashboard gains a compact "Tasks due" tile showing the open count, linking into the same page.

## Where tasks come from (automatic, no manual entry)

Tasks are derived each time the page loads, from existing data:

| Task | Source |
| --- | --- |
| Review a new high-strength opportunity (refi, seller intent, equity) | `homeowner_opportunities` |
| Respond to an introduction request | `introduction_requests` with status pending |
| Approve or decline a campaign proposal | `campaign_approvals` pending |
| Follow up after an introduction was accepted | accepted intros with no outcome recorded |
| Finish setting up sender branding | missing member/org sender name or reply-to |
| Complete profiles missing an address | portfolio clients with no usable address |
| Homeowners whose data still needs enriching | `property_enrichment_queue` backlog |

Checking a task off only hides the task — it never changes the underlying record. Tasks reappear only if a genuinely new signal shows up (a new opportunity, a new request), never for something already dismissed.

## Reminders

In-app only: an open-count badge on the Tasks nav item and the dashboard tile. No emails.

## Technical notes

- Reuse the existing `agent_feed_seen` pattern for completion state, but on a new table `business_task_state` (user_id, org_id, task_key, status, completed_at) with RLS scoped to the signed-in user plus org membership, and explicit GRANTs. Stable `task_key` per source row (e.g. `intro:<id>`, `opp:<id>`) so completion survives recomputation.
- New `src/lib/tasks.server.ts` builds the task list from the tables above; `src/lib/tasks.functions.ts` exposes `getMyTasks` and `setTaskDone` through `requireSupabaseAuth`.
- New route `src/routes/_authenticated/agent/tasks.tsx` and `.../lender/tasks.tsx`, both rendering a shared `src/components/tasks-workspace.tsx` inside `BusinessShell`; add the nav entry in `business-shell.tsx`.
- Dashboard tile added to `business-dashboard.tsx` using the existing `StatCard` link support.
