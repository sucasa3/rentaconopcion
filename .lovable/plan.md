# Celebration moments MVP — Robinhood-style gamification

A quick, single-mechanic experiment: surface animated, shareable celebration moments when agents, lenders, or homeowners hit high-value milestones. Keeps the SuCasa iOS-first visual language and avoids public leaderboards.

## What we are building

1. **Milestone detector** — a small set of first-time and threshold events tied to the behaviors you selected.
2. **Celebration surface** — a mobile-first, confetti-style overlay + persistent milestone card that feels like a reward, not a notification.
3. **Backend storage** — one new table to record what was celebrated and when, plus small hooks into existing success paths.
4. **Three-role rollout** — same component, different milestones for agents, lenders, and homeowners.

## Milestones for the MVP

| Role | Trigger | Celebration copy |
| --- | --- | --- |
| Homeowner | Claims profile / first sign-in | "Your SuCasa Home Record is live." |
| Homeowner | Completes Home Profile (address + owner details) | "Your home profile is complete — personalized insights unlocked." |
| Homeowner | Uploads first inspection or document | "Your home docs are now working for you." |
| Agent | First homeowner activates | "First homeowner activated — your book is working." |
| Agent | Reaches 5 activated homeowners | "5 homeowners active — keep the momentum." |
| Agent | First opportunity identified on a home | "First opportunity spotted." |
| Agent | First referral or transaction outcome logged | "Relationship turned into business." |
| Lender | First sponsored agent seat activated | "Your first sponsored agent is live." |
| Lender | First homeowner activated through a sponsored seat | "A sponsored homeowner just claimed their profile." |
| Lender | First loan opportunity engaged from a shared introduction | "First opportunity engaged." |

## Technical approach

### New table

`public.milestone_events`
- `id uuid primary key`
- `user_id uuid references auth.users(id) on delete cascade`
- `org_id uuid nullable` (for agent/lender org-scoped milestones)
- `role app_role not null`
- `milestone_key text not null` (e.g. `agent_first_activation`, `homeowner_profile_complete`)
- `context jsonb nullable` (client id, opportunity id, etc.)
- `celebrated_at timestamptz default now()`
- `seen boolean default false`
- Unique on `(user_id, milestone_key)` for first-time events; threshold events use a separate `milestone_key` per threshold.

Grants: `SELECT, INSERT, UPDATE` to `authenticated`; `ALL` to `service_role`. RLS policy: users read/write their own rows.

### Detection

Detection runs in the same server paths that already record the underlying success, so we do not add polling or cron jobs:
- Homeowner activation/profile completion: extend existing `tg_award_client_activation` and `tg_award_profile_completion` triggers to also write a milestone row when first/qualifying.
- Agent opportunity: hook into `homeowner_opportunities` insert path or existing opportunity compute.
- Agent referral/transaction: hook into `opportunity_outcomes` insert where outcome is a closed/won status.
- Lender sponsored seat activation: hook into `sponsored_agent_seats` status change.
- Lender opportunity engaged: hook into `introduction_requests` accepted/engaged path.

Each hook calls a single helper: `recordMilestone(supabase, { userId, orgId, role, key, context })`, which no-ops on duplicates.

### UI

- `CelebrationToast` component: full-screen or bottom-sheet overlay with confetti burst (canvas or lightweight CSS particles), icon, headline, subline, and a primary CTA.
- `MilestoneCard` component: a compact, persistent card for the dashboard showing the last unlocked milestone and the next one to chase.
- Placement:
  - Homeowner: on dashboard, after profile completion or first document upload.
  - Agent: on "Today" dashboard after activation/opportunity/referral events.
  - Lender: on lender dashboard after sponsored-seat milestones.
- Mark as seen via server function so the celebration does not repeat.

### Animation

Use the existing animation tokens (`animate-scale-in`, `animate-fade-in`) plus a lightweight confetti burst. Keep it under 2 seconds, mobile-performant, and respect `prefers-reduced-motion`.

## Out of scope for this MVP

- Streaks, badges, leaderboards, or recurring daily goals.
- Push notifications for milestones (can be added later).
- Complex "what-if" score simulators.
- Public rankings of agents.

## Success check

After implementation, a newly activating homeowner and a newly activating agent should each see one celebration moment on their next dashboard load, and the milestone should be recorded as `seen=true` after dismissal.

## Files we expect to touch

- New: `src/components/celebration-toast.tsx`, `src/components/milestone-card.tsx`, `src/lib/milestones.server.ts`, `src/lib/milestones.functions.ts`
- Migration: `supabase/migrations/..._milestone_events.sql`
- Modify: existing trigger paths in `src/lib/credits.server.ts` / `src/lib/opportunities.server.ts` / `src/lib/shared-opportunities.server.ts` to call milestone helper.
- Modify: `src/routes/_authenticated/dashboard.tsx`, `src/routes/_authenticated/agent/index.tsx`, `src/routes/_authenticated/lender/index.tsx` to render pending celebration.
