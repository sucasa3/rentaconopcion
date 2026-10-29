import { buildReverseInput, REVERSE_MAX_ITEM_COST_CENTS, type ReversePersonSummary } from "./batchdata-reverse";
import { addressKey } from "./upload-intake";

export const REVERSE_UPLOAD_TEST_USERS = [
  "4809cf48-c396-410d-8c54-ff617dacc91c",
  "d2526522-d77e-4257-a0a7-7936ce92bcd5",
] as const;

export function uploadReverseEnabled(userId: string, enabled?: string, mixedUsers?: string): boolean {
  return enabled === "true" && REVERSE_UPLOAD_TEST_USERS.some((id) => id === userId)
    && (mixedUsers ?? "").split(/[\s,;]+/).includes(userId);
}

export function uploadReverseInput(payload: { phone?: string | null; email?: string | null }) {
  const input = buildReverseInput({ ...payload, requestId: "validation" });
  if (!input.ok) return input;
  // Fixtures and reserved NANP numbers must never reach a paid service.
  if (input.email?.endsWith(".invalid") || (input.phone && /^\d{3}55501\d{2}$/.test(input.phone))) {
    return { ok: false as const, reason: "Test-only contact details — use local fixtures, not a paid search." };
  }
  return input;
}

export function reverseBatchCeiling(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("Select between 1 and 10 contacts.");
  return { maxLookups: count, maxCostCents: count * REVERSE_MAX_ITEM_COST_CENTS };
}

/** Mailing/contact addresses are evidence only, never proposed owned homes. */
export function reversePropertyCandidates(persons: ReversePersonSummary[]) {
  const seen = new Set<string>();
  return persons.flatMap((p, personIndex) => {
    const prop = p.property;
    if (!prop?.street || !prop.zip || p.propertyOwner !== true) return [];
    const key = addressKey({ address: prop.street, city: prop.city, state: prop.state, zip: prop.zip });
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ personIndex, personName: p.fullName, key, address: prop.street, city: prop.city, state: prop.state, zip: prop.zip }];
  });
}