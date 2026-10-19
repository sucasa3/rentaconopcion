# Household storage and lossless imports — approval package

**October 19, 2026 · design and read-only dry run only · not a deployment approval**

## Decision summary

Keep all 1,392 existing client records, their books, permissions, financial facts, opportunities and history. Add contacts beside them rather than duplicating client rows for co-borrowers. Add explicit household memberships only after confirmation; neither matching names nor shared ownership creates a household. Reuse the existing property cache and financial/signal readers. Nothing in this package changes the database, real imports, paid lookups, communications or published application.

The shared database does **not** yet have a durable canonical property/contact/household graph. `HomeRecord` is an assembled authorized projection, `home_profiles` is one cache per homeowner user, and `property_intel` is an address-keyed provider cache. The preview helper proves conservative behavior, not durable transactions or production RLS.

## 1. Actual storage/access audit

Read-only catalog queries inspected columns, indexes, foreign keys, RLS definitions (including restrictive vs permissive), ACL grants, and trigger functions. Database snapshot: **2026-10-19 23:15:48 UTC**. Aggregate evidence is in `docs/household-storage-reconciliation.json`; no names/emails/addresses were exported.

| Existing entity | Actual structure / invariant | Consequence |
|---|---|---|
| `lender_portfolio_clients` | 1,392 rows; combines one primary contact, one address, loan facts, relationship basis, scope and `homeowner_id`; FK to portfolio | Preserve IDs; use as book/property compatibility record, not one row per co-borrower |
| `lender_portfolios` | 65 books; `assigned_user_id`; partial unique index on assigned user **globally**, not per org | Imports must resolve caller's existing personal book; don't create parallel books or infer from membership order |
| client address index | unique `(portfolio_id,address_key)` for active, non-null keys; **all 1,392 keys null** | Existing index provides no current address dedupe protection; never blindly fill keys or change it in place |
| `property_intel` | 518 records; unique `address_normalized`; privileged raw payload reads | Reuse cache; don't expose it via household joins or copy payloads into new property rows |
| `home_profiles` | 0 rows; unique `user_id`, self-only CRUD RLS | Not a multi-property household table; leave it and the 102 existing profiles unchanged |
| `relationships` | 3 asserted org→professional-resource edges; checked relationship types; org-wide read policy | **Do not reuse for household/contact PII**: no book scope; existing relationship types don't encode the proposed graph |
| `homeowner_opportunities` | 2,840 rows; unique `(portfolio_client_id,category)`; consent-aware org policy | Preserve every property opportunity; grouping into a household queue must not rewrite or merge these records |
| `property_enrichment_queue` | 1,383 jobs; unique client; current SELECT is org-wide membership | Never stage by inserting client rows; insertion already queues paid work; new queue context must remain officer-filtered |
| task state | 0 `business_task_state` rows; unique user/org/task key | Keep completion semantics; household grouping is a projection, not a replacement of existing task IDs |

**Catalog specifics:** clients have permissive consent/member policies plus **restrictive** book-visibility SELECT/UPDATE/DELETE policies. `lender_book_visible` allows managers across a lender branch, assigned officers in their books, and legacy unassigned books only when teams are disabled; agent-org behavior differs and remains unchanged. `private.has_homeowner_consent` treats a null homeowner ID as imported relationship data, but linked homeowners need an unrevoked org grant. Named lender financial access still requires `classifyLenderAccess`; this is not interchangeable with book RLS.

ACLs currently grant eight table privileges to anon/authenticated/service_role on inspected existing tables. RLS, not lack of grants, is their enforcement boundary. No grant was modified. `property_intel` has admin-only raw SELECT; `relationships` is org-readable. The enrichment queue's org-wide policy is a **known direct-query metadata risk**: page-level officer filtering is not a replacement for RLS. Assess and fix specifically in the later approved rollout; don't broaden it or put contact PII there now.

Foreign keys currently reference auth users in several legacy tables; leave those alone. New user references must be plain UUIDs or point to `public.profiles`, never new auth-schema FKs. New schema is additive; no drop, rename, type change or required field added to existing rows.

## 2. Minimal additive schema specification (proposed, not applied)

Seven new tables are sufficient; no second provider store, duplicated financial engine or persistent outreach queue is needed.

### A. `home_properties` — canonical identity, not facts or permission

- `id uuid PK`, `identity_status text DEFAULT 'provisional' NOT NULL`, `identity_key text NULL`, `identity_version integer DEFAULT 1 NOT NULL`, `street_normalized text NULL`, `unit_normalized text NULL`, `zip5 text NULL`, `city text NULL`, `state text NULL`, `confirmed_by uuid NULL`, `confirmed_at timestamptz NULL`, `created_at timestamptz DEFAULT now() NOT NULL`.
- Identity states provisional/confirmed/disputed. Partial unique `identity_key WHERE identity_status='confirmed' AND identity_key IS NOT NULL` only after a complete reviewed address+unit/location key exists. Provisional rows may remain separate even when candidate strings match; unresolved units never collapse.
- No client provider-ID alias becomes identity unless verified. Retain existing cache lookup/provenance through current adapters; no raw permits, loan balances or contact fields in this table.
- New nullable `lender_portfolio_clients.property_id uuid REFERENCES home_properties(id)` and index. **Do not fill/change existing address_key during initial backfill.** No existing provider lookup or profile route is replaced at this stage.
- Raw global identity rows are internal-only: service_role access, RLS enabled, no anon or authenticated direct SELECT. Address/identity shown to a professional is projected from their already-authorized client row. This prevents a global property ID from becoming a cross-workspace address lookup endpoint.

### B. `book_contacts` — book-scoped contacts

- `id uuid PK`, `portfolio_id uuid NOT NULL FK lender_portfolios`, `homeowner_user_id uuid NULL` (plain UUID), `display_name text NULL`, `email text NULL`, `phone text NULL`, `legacy_client_id uuid NULL FK lender_portfolio_clients`, `identity_status text DEFAULT 'unresolved' NOT NULL`, `created_by uuid NULL`, `created_at/updated_at timestamptz DEFAULT now() NOT NULL`.
- Unique nullable `legacy_client_id` for idempotent shadow backfill; index portfolio. No unique email, phone or name and **no cross-book contact merging**. Shared communication details are match candidates, never identity evidence or consent.
- A homeowner account link is not transferred from the primary borrower to a co-borrower. Verification/consent remain per person.

### C. `client_contact_links` — property–contact participation and provenance

- `id uuid PK`, `portfolio_client_id uuid NOT NULL FK clients`, `contact_id uuid NOT NULL FK book_contacts`, `role text DEFAULT 'unspecified' NOT NULL`, `status text DEFAULT 'asserted' NOT NULL`, `source text NOT NULL`, `source_record jsonb DEFAULT '{}' NOT NULL`, `evidence jsonb DEFAULT '{}' NOT NULL`, `confirmed_by/confirmed_at/revoked_at NULL`, `created_at DEFAULT now() NOT NULL`.
- Unique `(portfolio_client_id,contact_id)`; role owner/co-borrower/other/unspecified; asserted/confirmed/rejected/revoked. Source import is **not confirmed ownership**.
- Validation trigger/RPC requires contact and client to be in the same book. It rejects foreign contact references, including contacts in another officer's book. Legacy linkage asserts only "this source row named this contact at this address," not ownership.
- Opportunity attribution remains at `portfolio_client_id`; one client/property can have many contacts and multiple confirmed households through memberships without losing its opportunities.

### D. `book_households` and E. `household_members`

- Households: `id uuid PK`, `portfolio_id uuid NOT NULL FK portfolios`, `status text DEFAULT 'pending' NOT NULL`, `label text NULL`, `created_by uuid NULL`, `confirmed_by/confirmed_at/revoked_at NULL`, timestamps.
- Members: `id uuid PK`, `household_id uuid NOT NULL FK book_households`, `contact_id uuid NOT NULL FK book_contacts`, `status text DEFAULT 'pending' NOT NULL`, confirmation/revocation actor/time, `source_record jsonb DEFAULT '{}' NOT NULL`, timestamps; unique `(household_id,contact_id)`.
- Same-book validation mandatory. A contact can belong to multiple explicitly confirmed groups; membership has no inferred sharing/access effects. A household's properties are derived only from authorized confirmed participation links of its confirmed members. Never infer household from ownership, mailing address or last name.
- No migration seeds confirmed households/members. Confirmation uses a dedicated authenticated action and records evidence/actor; imported assertions remain pending.

### F. `contact_import_batches` and G. `contact_import_rows`

- Batch: `id uuid PK`, `portfolio_id uuid NOT NULL FK portfolios`, `uploader_id uuid NOT NULL`, `idempotency_key text NOT NULL`, `file_hash text NOT NULL`, `source_filename text NOT NULL`, `original_csv text NOT NULL` (exact content; original workbook remains a future private-storage concern), `mapping jsonb DEFAULT '{}' NOT NULL`, `mapping_version integer DEFAULT 1 NOT NULL`, `review_revision integer DEFAULT 1 NOT NULL`, `state text DEFAULT 'staged' NOT NULL`, timestamps; unique `(portfolio_id,uploader_id,idempotency_key)`.
- Rows: `id uuid PK`, `batch_id uuid NOT NULL FK batches`, `source_ordinal integer NOT NULL`, `raw_record text NOT NULL`, `raw_cells jsonb NOT NULL`, `parsed jsonb DEFAULT '{}' NOT NULL`, `warnings jsonb DEFAULT '[]' NOT NULL`, `disposition text DEFAULT 'pending' NOT NULL`, `duplicate_of uuid NULL`, `proposed_contact_id/proposed_client_id/proposed_property_id uuid NULL`, `decision jsonb DEFAULT '{}' NOT NULL`, `committed_client_id/committed_contact_id uuid NULL`, `committed_at timestamptz NULL`, `failure_code text NULL`, timestamps; unique `(batch_id,source_ordinal)`.
- Preserve blank/preamble/malformed records too; retain logical CSV record ordinal and physical-line span. Parser handles quoted newlines, duplicate headers, BOM, unknown columns and explicit amount/rate units without invoking production parsing. Reuse existing vendored spreadsheet conversion only for compatibility; original workbook/sheet/formula provenance must not be claimed retained from converted CSV alone.
- Batch/row raw PII: SELECT only uploader + active membership + personal-book ownership (and explicit verified admin auditing if separately granted); a branch manager does not automatically get another officer's original file. Post-assignment raw staging stays with uploader; professional records follow authorized assignment. Define private retention/purge policy before staging real files; don't invent a duration now.

### Permissions and mutation contract

- Exact migration ordering for **every** new table: CREATE → role-specific GRANT → ENABLE RLS → POLICY. No anon grants. Authenticated gets only necessary SELECT for book contacts/links/households and uploader-owned batches; service_role gets full privileges. No direct authenticated mutation on identity, staging, graph or household confirmation tables; all writes go through a deliberately validated transaction RPC.
- New contact/household SELECT policies must require active membership, `lender_book_visible` for the associated book, and a client-link whose existing client SELECT policy succeeds. Hidden/revoked graph states get owner-scoped reads for correction without enabling hidden facts; ordinary rendered output still uses approved states and existing lender scope rules. Household root PII/labels never leaks through count queries.
- Approved promotion/confirmation RPCs: `SECURITY DEFINER SET search_path=public`; explicitly verify `auth.uid()`, active membership, personal book ownership, row/entity same-book consistency and review version; validate existing client and consent scope with the same checks used in application reads. REVOKE default PUBLIC/anon EXECUTE; grant authenticated EXECUTE only on intended guarded RPCs. Never trust passed workspace/owner IDs. No direct SQL permission to bypass these checks.
- Current member permissions, role checks, source grants, suppression, sponsorship, homeowner consent and financial classification are not widened. Confirmation establishes identity/grouping **only**.

## 3. Lossless import/promotion transaction

1. **Stage only:** resolve uploader's personal book server-side, persist exact file and all logical records atomically before classifying anything. No inserts/updates in clients, property cache, opportunities, credits, enrichment or communication tables. No mapping value sets `contact_marketing_permission` or intelligence scope.
2. Classify each row independently: exact-repeat row; candidate existing contact; shared existing property; genuinely new contact/property; invalid/addressless; missing-unit/location; suppressed; over allowance. Repeat row retains raw data and reference to original. A co-borrower at the same property is not a duplicate. Contact email matching at a different property does not eliminate the property.
3. Review matches inside the caller's book. Confirm stable contact IDs explicitly or retain separate provisional contacts; same-name/email never auto-merges. Missing units and conflicting loan/close facts remain in review; newer/completed data preserved. Original evidence/cells retained even when a mapping is corrected. No guessed ownership or primary residence.
4. **Explicit commit after approval:** authenticated transaction locks org capacity/agent ledger authority, uploader book, batch and affected property/contact keys in deterministic order. Revalidate active owner, review revision, suppression/consent and capacity under lock. One receipt per staged row; a different file does not auto-create a second contact when a reviewed existing ID is provided. Advisory identity locking + unique constraints cover concurrent commits.
5. Create **at most one compatibility client/property allocation per distinct reviewed property in that book**, link all reviewed contacts, preserve established client IDs and loan facts. Additional contacts and household membership spend no Home Profile capacity. Same contact at another real property requires another existing-rule property allocation. No change to org-wide allowance/credit pricing. Source provenance belongs on links/staging, not overwriting provider evidence.
6. Existing `tg_spend_homeowner_credit` spends on client INSERT and `tg_enqueue_property_enrichment` queues on INSERT; do not insert temporary clients to verify imports. In the future approved commit, one genuinely new compatibility client triggers these **once**; co-borrower links do not. Existing-property links and shadow backfill do not trigger either. If a no-lookups production promotion is separately required, design a narrow reviewed pending-release mechanism first—do not disable triggers or mark real orgs as tests.
7. Commit clients/links/receipts/capacity as one transaction. Interrupted before commit = no promotion; lost response after commit = read receipts, not reinsert. For large imports use stable reviewed chunks with all-or-nothing chunk transactions, resumable receipts and per-row states. Never claim a partially committed batch is complete. Retry only pending/failed chunks with fresh authority/review/capacity checks.
8. Enrichment remains a separate authorized existing process after actual import activation, with canonical cache reuse. No outreach happens on import; all sending remains an explicit separate consent/channel/suppression-gated action.

## 4. Household queue without losing opportunities

Reuse the existing generated Today/task/outcome machinery; no duplicate queue table. Group only authorized property opportunities under **explicitly confirmed** book household IDs; retain their original client/opportunity IDs underneath. One recommended household conversation slot per owner/household/channel/contacted-target, with one selected consenting recipient and property-level rationale references. Unconfirmed records use their existing contact/client queue, not surname/email clusters.

The preview foundation deduplicates conversation tasks per explicit contact, not globally per household. Before real rollout extend that projection with a household conversation selection/receipt key; preserve other contacts' distinct follow-ups and property tasks. Existing completed outcomes/task IDs remain authoritative. Persist idempotency via the existing action/outreach event path with nullable `household_id` and `conversation_key` only if its current idempotency fields cannot carry the scoped group key; verify this seam before adding another column. Household membership never authorizes a new recipient.

## 5. Conservative shadow reconciliation / migration sequence

**No DDL submitted or executed.** This is an approval-ready schema/transaction specification and read-only count projection, not a sandbox-applied migration or actual database fault-injection test.

| First shadow backfill, only after later approval | Expected |
|---|---:|
| Existing client rows retained, unchanged | 1,392 |
| Provisional book contacts (one per source client, no identity merges) | 1,392 |
| Legacy client–contact links, asserted not confirmed owners | 1,392 |
| Provisional property references for rows with addresses | 1,388 |
| Addressless rows kept pending with null property reference | 4 |
| Confirmed household/member links automatically created | **0** |
| New homeowner accounts / credit spends / lookup jobs / messages | **0** |
| Existing opportunities / enrichment jobs retained | 2,840 / 1,383 |

**Review-only alternative counts:** 1,109 book-scoped name/email/phone candidate contacts and 1,065 normalized address/location candidate properties. Neither is a safe post-migration identity count. Resolving those candidates could reduce provisional identities; approving this plan does not approve automatic merging. 206 property candidates appear across books. 176 same-book email groups span multiple properties (459 rows); the non-test subset is 11 groups/24 rows. Original discarded CSV rows are unavailable, so additional co-borrowers/lost properties cannot be counted or recovered.

Do schema-only deployment first with consumers disabled → verify grants/RLS in an isolated backend → approve idempotent shadow mapping → compare ID/reference/credit/provider/outreach counts → limited opt-in read-only household UI → review-only real file staging → approve one controlled promotion → only then switch CSV/manual/Discovery seams. Agent/lender/manager consumer changes are one coordinated release, not unrelated refactoring.

## 6. Exact code seams proposed (not changed)

| File | Later approved change |
|---|---|
| `src/lib/lender.server.ts:14–37,76–161` | Add separate full-record staging parser; no name/address discard; explicit monetary/interest units; preserve unmapped columns. Keep legacy parser during compatibility rollout |
| `src/lib/agent-discovery.ts:27–91` | Reuse unit-aware addressKey as candidate grouping only; never first-row-wins contact retention |
| `src/lib/lender.functions.ts:430–488` | Replace email-or-address skip with staged review + authenticated guarded promotion; retain owner/suppression/capacity |
| `src/lib/agent.functions.ts:1512–1571` | Replace property-only discard with one client/property plus many links; preserve phone/credit/suppression protections |
| `src/lib/discovery.server.ts:287–380` and `discovery.functions.ts:105–161` | Separate staging/review from Discovery insertion/processing; preserve property-based 100 accounting, phone checks and explicit enrichment start |
| `src/lib/personal-book.ts:9–19` | Reuse unchanged caller-owned personal-book authority |
| lender manual add `:490–548`; agent manual add `:1410–1465` | Route optional additional-contact/multi-property confirmation through same guarded transaction only after CSV seam proves safe |
| `assign_homeowners_to_member` / `0040_explicit_homeowner_team_assignment.sql` | Transactionally move/clone book-scoped contact/confirmed-member references with selected client IDs; split households that span retained and moved properties without granting the target unassigned properties; raw staging ownership remains original uploader |
| `src/lib/lender-workspace.server.ts`, `nba.server.ts`, `household-foundation.ts` | Add consent-filtered grouping projection; all property access/ranking/financial inputs remain existing canonical facts |
| new `household-import.functions.ts` + underlying server helper / guarded RPC | Stage/read/review/promote/resume under authenticated middleware; function middleware unchanged; no public import endpoint |

## 7. Rollback / risk controls

- **Before activation:** disable new consumers; leave unused tables and nullable references intact. Existing app reads old client fields and IDs. No reason to rewrite production data or drop columns.
- **After shadow backfill:** disable new reads/writes, preserve staging/link/confirmation audit data; old client rows/opportunities/queue untouched. Nullable new fields can remain unused. No credit refund or enrichment cancellation is necessary if only shadow links were created.
- **After actual imports:** rollback code only to compatibility reads; new primary clients must remain, along with contact links/staging, so returning to a first-contact-only view does not delete co-borrowers. Pause new commits, not existing accounts. Do not promise dropping schema is reversible or deleting new contacts is safe.
- **Assignments:** inspect mappings and snapshot affected IDs before any later operation; restoring ownership is an explicit manager-only transaction, not copying duplicate clients. No current reassignments performed.
- **RLS release blockers:** isolated real-session officer/manager/agent/homeowner tests for hidden/pending/revoked rows; ensure OR-composed policies never bypass a restrictive book filter; cross-workspace contact/entity FK checks; deny global property-ID enumeration; raw staging ownership; current org-wide enrichment metadata policy. Pure tests cannot establish these SQL properties.
- Confirm source-file retention and parser behavior for multiline records, XLSX multi-sheet exports and mapping/currency units before first real staging. Financial provider activation remains independently blocked; no ARM/PMI/refinance/junior-lien changes in this release.

## 8. Actual tests executed, not a headline total

`scripts/__tests__/household-import-dry-run.test.ts`: **10 passing contract tests**: reviewed contact→two properties; two co-borrowers→one capacity allocation; two units + missing-unit review; raw multiline/unmapped cells and exact-repeat retention; same-batch repeat receipts; new batch with reviewed identity; interruption before commit/resume; cross-workspace/officer/foreign-contact refusal; stale review/capacity; deduplicated conversation with two property opportunities.

Reused focused existing foundation: **57 passing tests** across household, unit-aware agent intake, personal-book ownership, raw-property authorization, lender scopes and spreadsheet conversion. **67 tests / 7 files passed**, no unrelated full-suite rerun.

Limits: dry-run simulator takes already-parsed synthetic rows; it does **not** prove a future full-record CSV parser, SQL row locks, live RLS, concurrent real commits, paid-trigger behavior under migration or household-level recipient scheduling. Those are explicitly required acceptance checks in the approved implementation stage. No completed Test Lab replay/inventory was repeated.

## Approval requested

Approve this minimal architecture and a later **isolated-backend** schema/transaction implementation first. A production schema application, shadow backfill, real-file import activation and publishing each remain withheld until explicitly authorized. No original historical CSV recovery is possible until the original file and reviewed authorization are supplied.