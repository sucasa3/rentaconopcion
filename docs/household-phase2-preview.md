# Phase 2 household foundation — October 19, 2026

## Delivered and isolation

- Preview entry: `/household-lab` while signed in. Only fictional bundled records; no real workspace IDs or property reads. Also embedded in the administrator Test Lab on preview hosts. Hidden on production hosts, not published.
- Non-destructive typed model: independent contacts and unit-aware canonical properties; workspace-scoped confirmed/pending/revoked contact–household–property edges with confirmation actor/date. Names never create links. One property can have multiple contacts and confirmed households.
- Cards: authorized confirmed-property count, qualifying property count (not contact count), one prioritized queue, duplicate conversation suppression per explicit contact ID, and expandable property detail. Completed tasks excluded. No messages sent.
- Equity: sums existing canonical amounts only when each included property is reliable, dated, uniquely identified and wholly attributed to that household. Shared/unknown ownership, missing amounts and duplicate identities withhold the total. No recovered financial calculation or new signal is enabled.
- Lossless import-review planner: unit-aware property buckets, every distinct contact/source row retained, only exact rows classified as repeats. A repeated email at another property never excludes it. No automatic household confirmation.

## Privacy corrections (unpublished application code)

- `signal-evidence.ts`: lender property_snapshot no longer grants permit evidence. Existing authorization remains server-side; agents' existing access rules are unchanged.
- EN/ES fact-source labels say Property records / Registros de la propiedad; internal provider identity and stored provenance remain intact.
- `lender-privacy.ts`, `lender-workspace.server.ts`: omit physical-home legacy categories, reasons and source fields; accept legacy inputs only when backed by permitted non-null canonical facts. LTV now requires both mortgage and valuation scopes.
- `opportunity-narrative.ts` and `nba.server.ts`: strip physical-home facts from lender narratives/queue snapshots, reject physical-home cached copy, omit physical-home categories and unsafe reasons. Agent narratives unchanged.
- `opportunities.functions.ts` and `business.functions.ts`: lender opportunity projections reuse consent-gated Today reviews instead of exposing raw legacy signals/reasons. Daily Read already uses that gated workspace.
- There is no established lender-specific permit/maintenance sharing grant to reuse. These surfaces fail closed; this task does not create a new consent scope or treat general intelligence consent as home-care consent.

## Validation

- Final complete regression suite after all projection edits: 515 tests passed across 41 files; latest preview compilation reports build OK.
- New household tests: co-borrowers, multi-property contacts, unrelated same-name owners, duplex units, unresolved units/addressless rows, shared ownership, completed tasks, duplicate outreach suppression, pending/revoked edges, cross-workspace/officer visibility and equity duplication/incompleteness.
- New privacy tests: permit scope denial, unsafe rationale/source-field filtering, canonical-field authorization, shared-record preservation and lender narrative/cached-copy rejection.
- Authenticated browser flow: own session → synthetic household page → property expansion → import review with three contact rows/two units. English desktop and phone checked; Spanish phone verified with a browser-only simulated profile-language response (no profile write). No horizontal overflow. This validates the isolated experience, not real household persistence.
- The requesting account cannot access administrator Test Lab. Its denial was respected; no role changed. Synthetic-only signed-in preview route allows review without privileged data.
- Real populated lender/officer API flows were not exercised end-to-end in this task; projection safeguards are covered by pure tests and existing access regressions, not a fresh live-account acceptance check.

## Unchanged / precise blockers

- Real CSV, manual-add, Discovery insertion and manager-assignment deduplication remain unchanged. The shared database has one primary contact per client row and a property-key uniqueness constraint; changing only the email filter would preserve additional properties but still discard co-borrowers or create duplicate enrichment. A durable, additive contact/property relationship store and reviewed transactional intake are required before safely switching actual imports. No production migrations were authorized or performed.
- Household confirmations, queue changes and import review are not durable and are not connected to live accounts. No real household matching or permission expansion is claimed.
- Historical skipped-row recovery requires the original CSV and explicit authorization; no reconstruction or restoration attempted.
- Financial activation still awaits provider aggregate-balance/freshness/same-loan evidence. No new refinance, ARM, PMI or junior-lien alerts. Production enrichment, ATTOM, billing, capacity and suppression unchanged.
- No repeat of the 206-response replay/inventory, paid lookup, provider request, external communication, database write, or publishing.