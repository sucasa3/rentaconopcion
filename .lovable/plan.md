# SuCasa Daily Read email for Agents and Lenders

A morning email that answers "Who in my book deserves attention today, why, and what should I do next?" — built on the intelligence SuCasa already produces, never a second engine.

## What already exists (findings from the code)

1. **The intelligence is already built, for both roles.**
   - Agents: one ranked queue builder produces every item Today shows — the person, the reason, the suggested next step, the temperature, and the counts. The Today copy itself (headline, "start with X, then Y", supporting lines) comes from pure helper functions with no screen dependency, so an email can call them and produce identical wording.
   - Lenders: the same shape exists on the lender side, including the permission classifier that decides whether a lender may see a homeowner by name at all, and which facts (value, mortgage, equity, engagement) they may see.
2. **Reusable directly:** the ranked queue, the reason/why text, the suggested opener and next step, temperature and counts, the lender access classifier and per-fact scopes, contact-channel eligibility, the branded email wrapper and template registry, the send helper, and the existing open/click tracking with its signed opaque tokens.
3. **Email + scheduling infrastructure exists.** Emails send through the managed sender on the verified SuCasa sending domain, using a registry of branded templates. Scheduled jobs follow one established shape: a small POST endpoint that authenticates the caller, then calls one server function; the daily campaign job already runs at 9:00 on this exact pattern. No new scheduler is needed.
4. **What genuinely does not exist yet:**
   - No per-professional email preference anywhere (no "Daily Read: on/off").
   - No record of "a Daily Read was already sent to this professional on this date, containing these people" — every existing send log is keyed to a homeowner recipient, not to a professional recipient.

## What will be added (small and specific)

- **One new table** recording each Daily Read send: recipient user, org, role, send date, state (new-signals / lighter / suppressed), the exact people included, status, sent/opened/clicked timestamps. Unique per recipient per date, so a retry can never double-send.
- **One preference field per professional**: Daily Read email on/off, default on, exposed as a single toggle in the existing agent and lender settings area. Nothing about homeowner marketing permissions is touched.
- **One eligibility function**, `shouldSendDailyRead(...)`, pure and unit-tested.
- **Two email templates** (agent, lender) registered alongside the existing ones.
- **One new scheduled endpoint** plus one schedule entry for a morning run.

## New vs existing intelligence

An item counts as **new** when it has not been included in any Daily Read sent to that same professional in the last 7 days, or when its underlying reason materially changed since the last time it was sent (a different opportunity, a higher urgency band, or a fresh engagement signal). Everything else is **existing**. The send record's stored list of included people is what makes this determination, which is why the table is required. Nothing is re-scored for email.

## The three states

- **State 1 — new actionable intelligence.** At least one new item. Subject names the count; body gives the one-line summary, a short category breakdown, the top three people with why-now and suggested next step, and a single primary action into Today.
- **State 2 — quiet, but unresolved work remains.** No new items, but worthwhile unresolved ones exist. Lighter version, reassuring tone, up to three names with their reason, one action.
- **State 3 — nothing worth acting on.** No email at all. Nothing is manufactured to keep a daily cadence.

## Preventing noise

- One send per professional per day, enforced by the table's uniqueness.
- An unchanged item cannot be presented as new; after being emailed it only reappears in the lighter state.
- A professional who received a lighter (state 2) email is not sent another lighter email for at least 3 days, so unresolved work does not nag daily.
- The toggle being off, or the address being suppressed by the mail system, ends the send quietly.

## Role separation

- **Agent emails** use only agent-appropriate reasons: property or value change, listing/status change, homeowner engagement, tenure and anniversary moments, overdue relationship follow-up. No refinance, HELOC, cash-out, qualification or loan language appears anywhere in the agent templates or copy helpers.
- **Lender emails** run entirely through the existing lender access classifier: only homeowners the lender may see by name are ever named, and each stated fact is checked against that lender's permitted scopes. Sponsored-only and agent-connected-only homeowners are never named, never counted by name, and never linked.

## Permission and compliance notes

- The recipient is the professional, so homeowner contact consent does not authorize this send; the professional's own toggle plus the platform's unsubscribe handling govern it. The managed sender appends its unsubscribe footer, as with every app email.
- Every homeowner name in a lender email passes the same gate the dashboard uses — the job reuses the workspace reader rather than reading client records directly, so the email cannot become a privacy back door.
- Tracking is limited to what the current infrastructure genuinely supports: generated, sent, opened, primary-action clicked, individual person clicked, and the resulting session and recorded outcome through existing event logging. Nothing is fabricated. Send/open/click land on the send record; clicks and sessions log through the existing first-party event ledger with no homeowner personal data.

## Design

White and warm-neutral dominant, deep navy type, SuCasa orange reserved for the single primary action and small emphasis marks, mobile-first single column, concise person cards with a clear hierarchy of name → why now → next step. Built on the existing branded email wrapper so it matches the invitation and campaign emails, and verified to render in Apple Mail and Gmail widths.

## Implementation sequence

1. Migration: the send-record table (with grants and policies) and the preference field.
2. `daily-read.ts` — pure derivation and `shouldSendDailyRead(...)`, with tests: three states, new-vs-existing, suppression windows, role-correct categories, no lender language in agent output.
3. `daily-read.server.ts` — per-recipient build using the existing agent queue and lender workspace readers, then render and send, recording the send.
4. The two templates plus registry entries.
5. The scheduled endpoint following the existing tick pattern, and a morning schedule.
6. The single on/off toggle in agent and lender settings.
7. Verify: typecheck, the full test suite, a dry-run of the job producing correct states without sending, one real send to your own address, and a rendering check at phone width.

## Technical detail

- Reused: `buildActionQueue` (`src/lib/nba.server.ts`) and `agent-daily.ts` for agents; `readLenderWorkspace` (`src/lib/lender-workspace.server.ts`) with `classifyLenderAccess` / scope checks and `lender-daily.ts` for lenders; `EmailBrand` + `TEMPLATES` + `sendTemplateEmail`; `signToken` / `openPixelUrl` / `clickUrl` from `src/lib/tracking.server.ts`, extended to resolve digest ids; `logNetworkEvent` for funnel events.
- New files: `src/lib/daily-read.ts`, `src/lib/daily-read.test.ts`, `src/lib/daily-read.server.ts`, `src/lib/email-templates/daily-read-agent.tsx`, `src/lib/email-templates/daily-read-lender.tsx`, `src/routes/api/public/daily-read.tick.ts`.
- New table `daily_read_sends (id, user_id, org_id, audience, send_date, state, item_ids jsonb, opportunity_ids jsonb, status, error_message, sent_at, opened_at, clicked_at, created_at)`, unique `(user_id, send_date)`, RLS: recipient may read own rows, service role full.
- Preference column on the professional profile record, `daily_read_email_enabled boolean not null default true`.
- Batched send per tick with a limit parameter and a `dryRun` flag, matching the existing tick jobs; schedule `0 11 * * *` UTC (7am Eastern) via the same `cron.schedule` + `net.http_post` pattern as the campaigns job.
- Ranking, scoring, narrative generation and channel eligibility are untouched.

## Not included

Homeowner-facing digests, weekly or SMS variants, any change to homeowner marketing permissions, and any change to ranking or opportunity generation.
