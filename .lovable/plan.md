# What "access to the homeowner" means — and making it visible in the UI

Today the rules exist and are enforced, but the agent screens don't state which
tier a record sits in. An agent can therefore read "I have this homeowner" as
"I may do anything with this homeowner". This plan names the tiers in plain
language and shows them on the record.

## The four tiers (already how the system behaves)

1. **Property intelligence** — facts about the house, keyed to the address:
   estimated value, estimated equity, characteristics, mortgage-age context.
   Available to any agent who has that address in their own book. Shared across
   workspaces because it describes the property, not a person. Never implies
   anything about the homeowner's plans.
2. **The agent's own client information** — what the agent themselves put in:
   name, contact details from their upload, notes, their own activity. Private
   to that workspace. Another agent with the same address never sees it.
3. **Homeowner-provided information** — anything the homeowner entered in
   SuCasa: documents, home profile answers, maintenance records, their own
   detailed activity. Requires the homeowner's participation and permission.
   Agents currently see only aggregate engagement counts, never the raw log.
4. **Permission to contact** — decided per channel (Call / Text / Email), and
   separately from all of the above. A documented client relationship plus the
   contact detail allows manual one-to-one contact; any recorded opt-out blocks
   that channel outright; campaigns and automation need explicit recorded
   permission.

Lender access is a separate gate again: homeowner consent is the only authority,
and nothing an agent does grants it.

## What to build

**A. Access summary on the client record**
On the agent client detail page, add a compact "What you can see" strip with the
four tiers as small labelled rows: Property facts (always), Your notes
(private to you), Homeowner-shared (present / not shared yet), Contact
(the permitted channels). Each row has a short one-line explanation behind a
"Why?" affordance, reusing the reasons the channel evaluator already returns.

**B. Clearer empty state for homeowner-shared information**
Where the record has no homeowner-provided data, say so explicitly — "This
homeowner hasn't shared their home information with you" — instead of showing
an ambiguous blank section.

**C. Contact row consistency**
Blocked channels stay visible but disabled with their existing reason, so the
distinction between "no phone on file" and "asked not to be called" is legible.

**D. Bilingual copy** for all new strings, matching the existing pattern.

## Not in scope
No change to any rule, gate, scope, or query. No new data, no new access. This
is labelling and empty-state work on top of the existing evaluators
(`contact-channels.ts`, `lender-access.ts`) — display only.

## Technical notes
- Tier state derives from data the client detail loader already returns
  (relationship basis, engagement aggregate presence, channel options); no new
  server function or column.
- Contact row renders from `evaluateAgentChannels` output via the existing
  `channel-actions` component; do not re-derive availability in the view.
