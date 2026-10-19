/** Offline replay. Input is exported Test Lab JSON; no fetch, keys or DB writes. */
import { readFileSync, writeFileSync } from 'node:fs';
import { auditStoredBatchdata, type StoredRecoveryRow } from '../src/lib/batchdata-recovery';

const [input, output, markdown] = process.argv.slice(2);
if (!input || !output || !markdown) throw new Error('Usage: bun scripts/audit-batchdata-stored.ts input.json output.json report.md');
const exported = JSON.parse(readFileSync(input, 'utf8')) as { rows: StoredRecoveryRow[] };
if (!Array.isArray(exported.rows)) throw new Error('Expected rows array');
const report = auditStoredBatchdata(exported.rows, new Date('2026-10-19T22:49:00Z'));
// Full evidence stays in local scratch, not committed or exposed to customers.
writeFileSync(output, JSON.stringify(report));
const lines = [
  '# Stored BatchData field recovery — Phase 1',
  '',
  'Audit date: October 19, 2026. No provider requests or database writes.',
  '',
  `Replayed ${report.storedRows} stored attempts; ${report.matchedResponses} successful property responses. Counts below are per response, not unique homes or individual liens. Repeated properties are included; do not interpret these as book counts.`,
  '',
  'Before = existing persisted normalized payload; after = exact-path evidence preserved by the isolated recovery module. Differences can include old mapping versions and intentionally ownership-filtered history; they are not all newly discovered provider fields. Fields already mapped remain unchanged in production.',
  '',
  '| Field | Actual response path | Before | After | % populated | Evidence | Source-date range | Use / limitation |',
  '|---|---|---:|---:|---:|---|---|---|',
  ...report.inventory.map(f => `| ${f.key} | \`${f.path}\` | ${f.before} | ${f.after} | ${f.percent}% | ${f.kind} | ${f.oldestSourceDate ?? 'undated'} → ${f.newestSourceDate ?? 'undated'} | ${f.use} |`),
  '',
  '## Verification and phase gate',
  '',
  '- The active normalizer is shared by production valuation/provider-primary and Test Lab. It was not edited. The older batchdata.server.ts extractors also remain untouched.',
  '- New src/lib/batchdata-recovery.ts preserves exact source paths, evidence kinds, retrieval times, source dates, all owner names, exact term months and separate active/historical lien rows. It deliberately does not infer identity or perform loan/equity calculations.',
  '- Recovered per-lien currentEstimatedBalance and financingType were previously not retained. CurrentEstimatedInterestRate was already present but is now explicitly estimated, never a verified recorded current-loan rate.',
  '- Permit samples contain only permitCount, allTags, tags, earliestDate, latestDate and totalJobValue. No nested event dates/descriptions exist in these samples. Tags do not establish diagnosis, completion, system age or an individual event.',
  '- False flags and zero counts are populated evidence, not positive signals. A missing permitCount is not proof of zero permits.',
  '- Recording/source-event dates are not evidence of current freshness. Undated loan estimates need a verified provider update timestamp and freshness policy before activation. Valuation source dates are retained; retrieval timestamps do not refresh stale values.',
  '- There are 32 multi-lien responses. Only 6 contain estimated balances for every component, and all 6 aggregates match their estimated component sum. The other 26 cannot validate aggregate balance semantics. This is supporting evidence, not proof of a verified payoff or a guarantee for incomplete records. No aggregate-plus-component summation is performed.',
  '- Open-lien interestRate, actual origination date, verified ARM initial fixed period/adjustment date and mortgage-insurance evidence are absent from the inspected active-lien schema. Historical interestRate and sale-associated rates cannot be promoted to current loans without reliable same-loan identity.',
  '',
  '**Phase 1 result: isolated recovery and replay complete; production activation gate remains blocked by unresolved balance/freshness semantics. Phase 2 and Phase 3 have not begun.**',
  '',
  '## Household / import audit (no data-model or production changes)',
  '',
  '- Current per-book email-or-address dedupe can discard different properties of the same contact. No authorized household membership/unit identity layer currently exists. Existing contacts and records were not changed, merged, imported or enriched.',
  '- Future work must preserve multiple contacts and distinct units, require explicit household/property confirmation, preserve assigned-book ownership, and enforce workspace/consent permissions before aggregating properties or equity.',
  '- Before any production recovery of skipped CSV rows, supply the original CSV and authorize a reviewed, no-paid-lookup import; the stored Test Lab cannot reconstruct discarded contacts.',
  '- Lender provider/permit leakage remains a Phase 2 task: lender-contact-card.tsx, opportunity rationale and API projections require a complete scope-aware fix, not removal of internal provenance.',
  '',
  '## Lender signal readiness',
  '',
  '| Signal | Readiness | Precise blocker |',
  '|---|---|---|',
  '| Verified refinance incentive | Blocked from recovered data | Only estimated active rates; no reliable same-loan recorded rate plus established terms/current balance. Existing mortgage-age and product safeguards must remain. |',
  '| General mortgage review | Candidate only, not enabled | Needs verified freshness, household dedupe and existing access/suppression tests; never promise savings. |',
  '| Specific ARM reset alert | Blocked | FinancingType is available but actual reset date/initial fixed period is absent. N/A index is not reset evidence. |',
  '| Mortgage-insurance removal | Blocked | Loan type and estimated LTV alone do not establish MI, original value, servicer criteria or cancellation eligibility. |',
  '| Existing junior-lien review | Candidate only, not enabled | Line flags/loan types exist, but position and current balance semantics need verification. |',
  '| Newly detected junior lien | Blocked | Recording dates alone do not prove change; no reliable prior snapshot comparison. |',
  '',
  '## Execution status',
  '',
  '- No migrations or production record writes; property_intel, ATTOM, enrichment worker, billing and entitlements untouched.',
  '- No provider calls, outreach, notification campaigns, or publication.',
  '- Offline evidence output is temporary and private; this report contains aggregate counts only.',
  '- Focused automated tests: 27 passed (8 new recovery safeguards, 17 existing mortgage-implied-value tests, 2 existing lender-mortgage facts tests); preview build OK. Offline replay covered all 206 stored attempts without provider or database writes.',
  '- Household/card/reporting/permission/UI acceptance tests are not claimed passed: those phases remain gated.',
];
writeFileSync(markdown, lines.join('\n') + '\n');
console.log(JSON.stringify({ stored: report.storedRows, matched: report.matchedResponses, fields: report.inventory.length }));