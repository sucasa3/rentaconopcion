import { describe, expect, it } from 'vitest';
import { emptyClientFacts } from '../client-facts';
import { lenderLegacyAllowed, lenderNarrativeFacts, lenderSafeReasons } from '../lender-privacy';
describe('lender privacy projection', () => {
  it('snapshot access cannot expose physical-home rationale or provenance', () => {
    expect(lenderLegacyAllowed({ category:'permit_activity', source_fields:['permit_activity'], reasons:['3 permits'] }, { permit_activity:3 })).toBe(false);
    expect(lenderLegacyAllowed({ category:'equity', source_fields:['estimated_equity'], reasons:['Roof repairs suggest a loan'] }, { estimated_equity:500 })).toBe(false);
  });
  it('legacy financial facts require the already-authorized canonical field', () => {
    expect(lenderLegacyAllowed({ category:'equity', source_fields:['estimated_equity'] }, { estimated_equity:null })).toBe(false);
    expect(lenderLegacyAllowed({ category:'equity', source_fields:['estimated_equity'] }, { estimated_equity:500 })).toBe(true);
    expect(lenderLegacyAllowed({ category:'equity', source_fields:[] }, { estimated_equity:500 })).toBe(false);
  });
  it('projection strips permit facts without changing the shared Home Record', () => {
    const f = { ...emptyClientFacts('c1'), permitCount:3, lastPermitDate:'2026-10-01', permitTotalValue:50000 };
    expect(lenderNarrativeFacts(f).permitCount).toBe(0);
    expect(lenderNarrativeFacts(f).lastPermitDate).toBeNull();
    expect(f.permitCount).toBe(3);
  });
  it('outgoing rationale omits provider attribution and care facts', () => {
    expect(lenderSafeReasons(['BatchData reports value', 'Maintenance due', 'Estimated equity available'])).toEqual(['Estimated equity available']);
  });
});