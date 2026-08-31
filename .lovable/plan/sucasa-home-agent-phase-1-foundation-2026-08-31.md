# SuCasa Home Agent — Phase 1 foundation

Nothing gets rebuilt. The pieces that already exist keep their jobs and get promoted into the agentic loop:

| Layer | What already does it |
|---|---|
| Memory | Home Record (`home-record.ts`), Home Timeline, documents, inspection findings, service log, value snapshots |
| Intelligence | Signal engine (`signals.ts`), Home Score, refi/equity math |
| Recommendation | Home Plan, alerts (`homeowner_alerts`), next-step hero |
| Action | Service requests, tasks, opportunity outcomes |
| Outcome | `opportunity_outcomes`, service-request completion |

What's missing is the connective tissue: durable conversational memory, declared intent, an explicit permission ladder, and an action object the agent can propose, get approved, execute and close. That is this phase.

## 1. Persistent memory the agent can write to

- New `home_memory`: typed facts the agent learns or the homeowner tells it (preference, goal, important date, appliance, system detail, note), each with source, confidence and the conversation turn it came from.
- New `agent_conversations` / `agent_messages`: the Home Agent stops being one-shot. Every thread persists, and past turns become context on the next one.
- The Home Record assembler gains a `memory` section so all three surfaces (dashboard, agent, plan) read the same learned facts.

## 2. Intent as a first-class object

- New `homeowner_intents`: type (SELL, BUY, REFINANCE, HELOC, RENOVATE, MAINTAIN, REPAIR, INSURE, MOVE, VALUE), confidence, evidence, status, expiry.
- Intent is written from two places: the agent detecting it in conversation, and behavior already tracked in `homeowner_activity_events` (repeated value checks, equity views).
- Declared intent feeds the signal engine as an input, so an active SELL intent reorders what the home surfaces — instead of intent living only as a lead score.

## 3. Permission ladder

- New `agent_permissions`: per-capability level 1–5 (observe / recommend / prepare / execute / escalate), defaulting to level 2 for everything except record-keeping (level 4).
- A homeowner-facing "What SuCasa can do" screen where each capability is set, plus a permanent activity log: what it knew, what it recommended, what it wanted to do, what it actually did.
- Nothing above the granted level ever runs; the agent escalates to an approval card instead.

## 4. Recommendation → Action → Outcome

- New `agent_actions`: recommendation text, source signal/intent, required permission level, status (`proposed` → `approved` → `in_progress` → `done` / `declined`), payload, result.
- Signals and Home Plan items become action proposals rather than dead-end text. The first three executable capabilities, all low-risk:
  1. **Record keeping** — log completed maintenance, file a document, update a system age (auto-execute at level 4).
  2. **Prepare a service request** — draft category, description and urgency from a finding; homeowner taps approve, the existing request pipeline runs unchanged.
  3. **Prepare a professional introduction** — only for a declared intent, homeowner-initiated, through the existing consent-gated introduction flow.
- Every completed action writes an outcome row and a memory fact, so the profile gets smarter.

## 5. The Home Agent itself

- `assistant.functions.ts` becomes a tool-using agent: read Home Record, read timeline, search documents, record a memory fact, record an intent, propose an action, approve/execute an action. Same gateway, tools added, thread history included.
- Rendered where the assistant already lives, with tool activity visible ("I checked your roof age", "I've drafted a request").
- Proactive: a daily server pass turns unread high-strength signals into agent-authored recommendations, surfaced as at most three "Here's what matters" items on the dashboard. No new notification noise — the existing alert lifecycle controls repetition.

## The killer workflow this delivers

SuCasa notices the water heater is at end of life → explains what it costs to ignore → recommends replacement → offers to prepare the service request → homeowner approves → request goes out → completion is recorded back into the home's memory.

## Technical notes

- All new tables are homeowner-scoped with RLS on `auth.uid()` plus explicit grants; nothing in this phase is readable by agents or lenders. Professional visibility stays behind the existing consent tables.
- Tools run server-side inside `createServerFn` handlers with the existing `requireSupabaseAuth` middleware; each tool re-checks the permission level before executing.
- Signal engine stays pure and client-safe — intent and memory arrive as inputs to `assembleHomeRecord`, not as new fetches inside the engine.
- No new property-data calls: everything reads the cached Home Record.
- English and Spanish strings for all new surfaces.

## Order

1. Memory + conversation persistence
2. Permission ladder + activity log
3. Action object with record-keeping execution
4. Intent detection
5. Service-request preparation + proactive brief

## To confirm

Should the agent default to preparing work and waiting for a tap (level 3) on maintenance items, or stay at recommend-only (level 2) until the homeowner explicitly grants more?
