import { describe, expect, it } from 'vitest';
import { auditStoredBatchdata, recoverBatchdataEvidence, valuesAt } from '../batchdata-recovery';

const raw = { results: { properties: [{
  owner: { names: [{ full: 'Owner A' }, { full: 'Owner B' }], ownerOccupied: false, ownerStatusType: 'Individual' },
  openLien: { totalOpenLienCount: 2, totalOpenLienBalance: 250000, mortgages: [
    { loanAmount: 250000, currentEstimatedBalance: 210000, currentEstimatedInterestRate: 7.1, financingType: 'Adjustable Rate', loanTermMonths: 359, recordingDate: '2020-01-01', dueDate: '2050-01-01', ltv: 75 },
    { loanAmount: 50000, currentEstimatedBalance: 30000, helocFlag: true },
  ] },
  mortgageHistory: [{ loanAmount: 100000, interestRate: 4.2 }],
  permit: { permitCount: 0, latestDate: '2023-04-06', allTags: ['Roofing'] },
}] } };

describe('isolated stored-data recovery safeguards', () => {
  it('retains two owner contacts without declaring a household', () => {
    const result = recoverBatchdataEvidence(raw, '2026-10-19');
    expect(result?.evidence['ownerNames']?.values).toEqual(['Owner A', 'Owner B']);
    expect(result).not.toHaveProperty('household');
  });
  it('keeps two open liens separate from one historical lien without summing aggregate balances', () => {
    const result = recoverBatchdataEvidence(raw, '2026-10-19');
    expect(result?.activeLiens).toHaveLength(2);
    expect(result?.history).toHaveLength(1);
    expect(result?.evidence['aggregateLienBalance']?.values).toEqual([250000]);
    expect(result?.activeLiens.map(l => l['estimatedBalance'])).toEqual([[210000], [30000]]);
    expect(result?.currentVerifiedPayoff).toBeNull();
  });
  it('never promotes an estimated rate into a verified refinance rate', () => {
    const result = recoverBatchdataEvidence(raw, '2026-10-19');
    expect(result?.evidence['estimatedRate']?.kind).toBe('estimated');
    expect(result?.verifiedCurrentRate).toBeNull();
  });
  it('does not derive ARM reset from recording date and term', () => {
    const result = recoverBatchdataEvidence(raw, '2026-10-19');
    expect(result?.activeLiens[0]?.['termMonths']).toEqual([359]);
    expect(result?.armAdjustmentDate).toBeNull();
  });
  it('never turns LTV under 80 into guaranteed insurance cancellation', () => {
    expect(recoverBatchdataEvidence(raw, '2026-10-19')?.insuranceCancellationEligibility).toBeNull();
  });
  it('does not mark an existing lien newly detected without comparison history', () => {
    expect(recoverBatchdataEvidence(raw, '2026-10-19')?.newlyDetectedLien).toBe(false);
  });
  it('does not invent permit events from summary tags or dates', () => {
    const result = recoverBatchdataEvidence(raw, '2026-10-19');
    expect(result?.permitEvents).toEqual([]);
    expect(result?.evidence['permitCount']?.values).toEqual([0]);
  });
  it('preserves false occupancy and counts coverage per response, not per owner', () => {
    expect(valuesAt(raw.results.properties[0], 'owner.ownerOccupied')).toEqual([false]);
    const report = auditStoredBatchdata([{ id: 'fixture', success: true, requested_at: '2026-10-19', raw_response: raw, normalized: {} }]);
    expect(report.inventory.find(f => f.key === 'ownerNames')?.after).toBe(1);
    expect(report.inventory.find(f => f.key === 'ownerNames')?.percent).toBe(100);
  });
});