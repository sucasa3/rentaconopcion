/** Phase 1 only: offline/Test Lab evidence. Never imported by production enrichment. */
import { firstBatchdataProperty } from './batchdata-normalize';

type RecordValue = Record<string, unknown>;
export type EvidenceKind = 'recorded' | 'estimated' | 'reported' | 'unverified';
export interface RecoveryField {
  key: string;
  path: string;
  before: string | null;
  kind: EvidenceKind;
  datePath: string | null;
  use: string;
}
const field = (key: string, path: string, before: string | null, kind: EvidenceKind, datePath: string | null, use: string): RecoveryField => ({ key, path, before, kind, datePath, use });
export const RECOVERY_FIELDS: RecoveryField[] = [
  field('ownerNames', 'owner.names[].full', null, 'reported', 'owner.ownershipStartDate', 'Ownership review only; never household proof'),
  field('ownerOccupied', 'owner.ownerOccupied', 'ownership.ownerOccupied', 'reported', null, 'Residence candidate; confirmation preferred'),
  field('ownerStatus', 'owner.ownerStatusType', null, 'reported', null, 'Ownership context, not household identity'),
  field('ownershipStart', 'owner.ownershipStartDate', null, 'recorded', 'owner.ownershipStartDate', 'Ownership window'),
  field('residenceYears', 'owner.lengthOfResidenceYears', 'ownership.ownershipYears', 'reported', null, 'Tenure context'),
  field('value', 'valuation.estimatedValue', 'valuation.estimate', 'estimated', 'valuation.asOfDate', 'Estimated value only'),
  field('valueLow', 'valuation.priceRangeMin', 'valuation.low', 'estimated', 'valuation.asOfDate', 'Estimated range'),
  field('valueHigh', 'valuation.priceRangeMax', 'valuation.high', 'estimated', 'valuation.asOfDate', 'Estimated range'),
  field('valueConfidence', 'valuation.confidenceScore', 'valuation.confidence', 'reported', 'valuation.asOfDate', 'Provider confidence, not identity confidence'),
  field('valueDate', 'valuation.asOfDate', 'valuation.asOf', 'reported', 'valuation.asOfDate', 'Valuation freshness'),
  field('assessedValue', 'assessment.totalAssessedValue', 'valuation.assessedValue', 'reported', 'assessment.assessmentYear', 'Tax assessment context'),
  field('marketValue', 'assessment.totalMarketValue', 'valuation.marketValue', 'reported', 'assessment.marketValueYear', 'Assessment context, not AVM'),
  field('openLienCount', 'openLien.totalOpenLienCount', 'mortgage.openLienCount', 'reported', null, 'Current lien count only'),
  field('aggregateLienBalance', 'openLien.totalOpenLienBalance', 'mortgage.totalOpenLienBalance', 'unverified', null, 'Blocked: aggregate semantics disagree with components'),
  field('lender', 'openLien.mortgages[].lenderName', 'mortgage.liens[].lender', 'reported', 'openLien.mortgages[].recordingDate', 'Active-loan review'),
  field('originalPrincipal', 'openLien.mortgages[].loanAmount', 'mortgage.liens[].amount', 'recorded', 'openLien.mortgages[].recordingDate', 'Original principal, never payoff'),
  field('estimatedBalance', 'openLien.mortgages[].currentEstimatedBalance', null, 'estimated', null, 'Estimated component balance; no aggregate addition'),
  field('estimatedRate', 'openLien.mortgages[].currentEstimatedInterestRate', 'mortgage.liens[].rate', 'estimated', null, 'General mortgage review, not verified refinance'),
  field('rateClassification', 'openLien.mortgages[].financingType', null, 'reported', 'openLien.mortgages[].recordingDate', 'ARM review only; no reset date'),
  field('loanType', 'openLien.mortgages[].loanType', 'mortgage.liens[].loanType', 'reported', 'openLien.mortgages[].recordingDate', 'Product review, no insurance eligibility claim'),
  field('termMonths', 'openLien.mortgages[].loanTermMonths', null, 'reported', 'openLien.mortgages[].recordingDate', 'Exact months, no rounding loss'),
  field('recordingDate', 'openLien.mortgages[].recordingDate', 'mortgage.liens[].recordingDate', 'recorded', 'openLien.mortgages[].recordingDate', 'Recording date, not proven origination'),
  field('maturityDate', 'openLien.mortgages[].dueDate', 'mortgage.liens[].maturityDate', 'reported', 'openLien.mortgages[].recordingDate', 'Maturity, never ARM reset'),
  field('estimatedPayment', 'openLien.mortgages[].estimatedPaymentAmount', 'mortgage.liens[].estimatedPayment', 'estimated', null, 'Estimated payment, no savings promise'),
  field('ltv', 'openLien.mortgages[].ltv', 'mortgage.liens[].ltv', 'estimated', null, 'LTV review, not guaranteed PMI removal'),
  field('helocFlag', 'openLien.mortgages[].helocFlag', null, 'reported', 'openLien.mortgages[].recordingDate', 'Existing lien context, not newly detected'),
  field('equityCreditLine', 'openLien.mortgages[].equityCreditLine', null, 'reported', 'openLien.mortgages[].recordingDate', 'Existing line context'),
  field('historicalPrincipal', 'mortgageHistory[].loanAmount', 'mortgage.history[].amount', 'recorded', 'mortgageHistory[].recordingDate', 'History only; not currently open'),
  field('historicalRate', 'mortgageHistory[].interestRate', 'mortgage.history[].rate', 'reported', 'mortgageHistory[].recordingDate', 'History only; not current-loan rate'),
  field('historicalRateType', 'mortgageHistory[].interestRateType', null, 'reported', 'mortgageHistory[].recordingDate', 'Historical classification only'),
  field('lastSaleDate', 'sale.lastSale.saleDate', 'sales.lastSaleDate', 'recorded', 'sale.lastSale.saleDate', 'Sale date, separate from loan age'),
  field('lastSalePrice', 'sale.lastSale.price', 'sales.lastSaleAmount', 'reported', 'sale.lastSale.saleDate', 'Respect salePriceIsEstimated flag'),
  field('salePriceEstimated', 'sale.lastSale.salePriceIsEstimated', null, 'reported', 'sale.lastSale.saleDate', 'Price evidence classification'),
  field('priorSaleDate', 'sale.priorSale.saleDate', 'sales.priorSales[].date', 'recorded', 'sale.priorSale.saleDate', 'Prior sale history'),
  field('priorSalePrice', 'sale.priorSale.price', 'sales.priorSales[].amount', 'reported', 'sale.priorSale.saleDate', 'Prior sale, no duplicate totals'),
  field('deedHistoryDate', 'deedHistory[].recordingDate', 'sales.priorSales[].date', 'recorded', 'deedHistory[].recordingDate', 'Deeds are not necessarily sales'),
  field('deedHistoryPrice', 'deedHistory[].salePrice', 'sales.priorSales[].amount', 'reported', 'deedHistory[].recordingDate', 'Historical transfer context'),
  field('permitCount', 'permit.permitCount', 'permits.count', 'reported', 'permit.latestDate', 'Homeowner only; count is summary'),
  field('permitLatestDate', 'permit.latestDate', 'permits.lastPermitDate', 'reported', 'permit.latestDate', 'Homeowner only; no diagnosis'),
  field('permitEarliestDate', 'permit.earliestDate', 'permits.firstPermitDate', 'reported', 'permit.earliestDate', 'Homeowner only'),
  field('permitTags', 'permit.allTags[]', 'permits.tags[]', 'reported', 'permit.latestDate', 'Summary tags, not event descriptions'),
  field('permitTotalJobValue', 'permit.totalJobValue', 'permits.totalValue', 'reported', 'permit.latestDate', 'Summary only; never add to event totals'),
];

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}
/** Preserve zero/false as evidence; never invent fallback paths. */
export function valuesAt(value: unknown, path: string): unknown[] {
  const parts = path.split('.');
  let current: unknown[] = [value];
  for (const part of parts) {
    const array = part.endsWith('[]');
    const key = array ? part.slice(0, -2) : part;
    current = current.flatMap(item => {
      const next = record(item)?.[key];
      return array ? (Array.isArray(next) ? next : []) : [next];
    });
  }
  return current.filter(item => item !== null && item !== undefined && item !== '' && (typeof item !== 'number' || Number.isFinite(item)));
}

export function recoverBatchdataEvidence(raw: unknown, requestedAt: string) {
  const property = firstBatchdataProperty(raw);
  if (!property) return null;
  const evidence = Object.fromEntries(RECOVERY_FIELDS.map(f => [f.key, {
    values: valuesAt(property, f.path), path: f.path, kind: f.kind,
    sourceDates: f.datePath ? valuesAt(property, f.datePath) : [],
    retrievedAt: requestedAt, use: f.use,
  }]));
  const openLien = record(property['openLien']);
  const liens = Array.isArray(openLien?.['mortgages']) ? openLien['mortgages'] : [];
  const history = Array.isArray(property['mortgageHistory']) ? property['mortgageHistory'] : [];
  return {
    version: 'test-lab-recovery-v1', evidence,
    // Keep each component tied to its own source row. No aggregate balance math.
    activeLiens: liens.map(lien => Object.fromEntries(RECOVERY_FIELDS.filter(f => f.path.startsWith('openLien.mortgages[].')).map(f => [f.key, valuesAt(lien, f.path.replace('openLien.mortgages[].', ''))]))),
    history: history.map(lien => Object.fromEntries(RECOVERY_FIELDS.filter(f => f.path.startsWith('mortgageHistory[].')).map(f => [f.key, valuesAt(lien, f.path.replace('mortgageHistory[].', ''))]))),
    currentVerifiedPayoff: null,
    verifiedCurrentRate: null,
    armAdjustmentDate: null,
    insuranceCancellationEligibility: null,
    newlyDetectedLien: false,
    permitEvents: [], // Stored samples contain summary only; no nested event structure exists.
  };
}

export interface StoredRecoveryRow { id: string; success: boolean; requested_at: string; raw_response: unknown; normalized: unknown }
export function auditStoredBatchdata(rows: StoredRecoveryRow[], now = new Date()) {
  const matched = rows.filter(r => r.success && firstBatchdataProperty(r.raw_response));
  const recovered = matched.map(r => ({ id: r.id, result: recoverBatchdataEvidence(r.raw_response, r.requested_at) }));
  const inventory = RECOVERY_FIELDS.map(f => {
    const before = matched.filter(r => f.before && valuesAt(r.normalized, f.before).length > 0).length;
    const after = recovered.filter(r => (r.result?.evidence[f.key]?.values.length ?? 0) > 0).length;
    const dates = recovered.flatMap(r => r.result?.evidence[f.key]?.sourceDates ?? []).filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) && Number.isFinite(Date.parse(d)));
    const stale = dates.filter(d => now.getTime() - Date.parse(d) > 365 * 86400000).length;
    return { ...f, before, after, recovered: f.before ? Math.max(0, after - before) : after, percent: matched.length ? Math.round(after / matched.length * 1000) / 10 : 0, oldestSourceDate: dates.length ? [...dates].sort()[0] : null, newestSourceDate: dates.length ? [...dates].sort().at(-1) : null, sourceDatesOlderThanYear: stale };
  });
  return { storedRows: rows.length, matchedResponses: matched.length, inventory, recovered };
}