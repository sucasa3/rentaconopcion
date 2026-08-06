# Client activity: lead with Recommendations, flag what's new

## What changes

1. **Tab order** in the agent portfolio "Client activity" widget becomes:
   **Recommendations due** (default) → **Communicated** → **Referrals**.
2. **New markers**: any recommendation or referral the agent hasn't seen before shows a small
   "New" dot/badge, and the tab itself shows a count pill (e.g. `Recommendations due · 4`).
3. **Auto-clear on view**: opening a tab marks everything currently listed in it as seen, so the
   badge clears on its own. No busywork.
4. **Manual "Mark reviewed"** on each recommendation row: hides that item from the feed until the
   underlying signal changes (e.g. a newer permit, or an inspection finding replaces the estimate).
   A small "Show reviewed (n)" toggle brings them back.

Referrals get the New dot only — no reviewed action, since their status already moves on its own.

## Why this shape

The agent's job on this screen is "what do I act on next", so recommendations lead. Referrals are
history/status and belong last. Auto-clear keeps the badge trustworthy without asking the agent to
maintain a checklist; the explicit "Mark reviewed" exists for the one case auto-clear can't cover —
"I saw it and it's handled / not relevant."

We are not adding a "Mark as communicated" state: campaign sends already populate the
**Communicated** tab automatically, so a manual duplicate would drift out of sync.

## Technical notes

- New table `public.agent_feed_seen`: `user_id`, `portfolio_id`, `item_key` (text), `kind`
  (`recommendation` | `referral`), `first_seen_at`, `reviewed_at`, unique on
  (user_id, portfolio_id, item_key). RLS + GRANTs scoped to `auth.uid() = user_id`.
  Item keys are already stable: recommendations use `${clientId}:${component}` /
  `${clientId}:permit:${i}`, referrals use the service request id.
- `src/lib/agent.functions.ts`: `getAgentPortfolio` also returns the caller's seen/reviewed keys for
  the portfolio; each feed row gains `is_new` and `reviewed_at`. Two new server functions:
  `markAgentFeedSeen({ portfolioId, items })` (bulk upsert, fired when a tab is opened) and
  `setAgentFeedReviewed({ portfolioId, itemKey, reviewed })`.
- `src/routes/_authenticated/agent/portfolio.$id.tsx`: reorder `TabsTrigger`s, set
  `defaultValue="recommendations"`, add count pills, a New dot on unseen rows, the per-row
  "Mark reviewed" button, and the "Show reviewed" toggle. `onValueChange` fires the seen mutation
  (debounced, fire-and-forget) and invalidates the portfolio query.
- The client detail drawer's recommendation list reuses the same `is_new` / reviewed flags.
- Lender portfolio is untouched.

## Verify

- Open `/agent/portfolio/<id>`: Recommendations due is the first and default tab, Referrals last.
- Unseen rows show a New dot and the tab pill shows the count; switching to the tab and back clears
  it, and it stays cleared after a reload.
- "Mark reviewed" removes a row; "Show reviewed" brings it back with a muted style.
