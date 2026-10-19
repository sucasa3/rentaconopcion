import type { ClientFacts } from './client-facts';

/** Physical-home data is not covered by lender property_snapshot/intelligence grants.
 * There is no established lender home-care sharing path; omit rather than invent consent.
 */
export const PHYSICAL_HOME = /permit|maintenance|inspection|home[_ -]?care|home[_ -]?condition|home[_ -]?project|repair|roof|hvac|plumbing|water heater|improvement|renovation|building work|permiso|mantenimiento|inspecci[oó]n|reparaci[oó]n|techo/i;
export function lenderSafeReasons(reasons: string[]): string[] {
  return reasons.filter(r => !PHYSICAL_HOME.test(r) && !/batchdata|attom/i.test(r));
}
export function lenderNarrativeFacts(facts: ClientFacts): ClientFacts {
  return { ...facts, permitCount: 0, lastPermitDate: null, permitTotalValue: null };
}
/** Legacy structured evidence must match already-permitted non-null canonical inputs.
 * Unknown provenance or physical-home categories fail closed, without rewriting storage.
 */
export function lenderLegacyAllowed(row: { category: string; source_fields?: string[]; reason_codes?: string[]; reasons?: string[] }, facts: Record<string, unknown>): boolean {
  if (PHYSICAL_HOME.test(row.category) || (row.source_fields ?? []).some(f => PHYSICAL_HOME.test(f)) ||
      (row.reason_codes ?? []).some(f => PHYSICAL_HOME.test(f)) || (row.reasons ?? []).some(f => PHYSICAL_HOME.test(f))) return false;
  return (row.source_fields ?? []).length > 0 && (row.source_fields ?? []).every(f => Object.hasOwn(facts,f) && facts[f] != null);
}