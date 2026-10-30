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

const digits10 = (v: string) => v.replace(/\D/g, "").slice(-10);

/**
 * When a contact supplied both phone and email, a returned person whose own
 * listed contact details contradict either one (or two people split the phone
 * and the email) is a conflict: hold for review, never auto-confirm.
 */
export function reverseContactConflict(
  persons: ReversePersonSummary[],
  input: { phone?: string | null; email?: string | null },
): string | null {
  if (!input.phone || !input.email || !persons.length) return null;
  const phone = digits10(input.phone);
  const email = input.email.trim().toLowerCase();
  const hasPhone = (p: ReversePersonSummary) => p.phones.some((x) => digits10(x.number) === phone);
  const hasEmail = (p: ReversePersonSummary) => p.emails.some((x) => x.trim().toLowerCase() === email);
  const phoneOwners = persons.filter(hasPhone);
  const emailOwners = persons.filter(hasEmail);
  if (phoneOwners.length && emailOwners.length && !persons.some((p) => hasPhone(p) && hasEmail(p))) {
    return "The phone and the email point to different people. Held for review; nothing was confirmed.";
  }
  const contradicts = persons.some((p) => (p.phones.length > 0 && !hasPhone(p) && hasEmail(p))
    || (p.emails.length > 0 && !hasEmail(p) && hasPhone(p)));
  if (contradicts) {
    return "Only one of the phone or email belongs to the matched person. Held for review; nothing was confirmed.";
  }
  return null;
}

/** Apply conflict review on top of the provider classification. */
export function withConflictReview<T extends { status: string; persons: ReversePersonSummary[]; reviewReason: string | null }>(
  result: T, input: { phone?: string | null; email?: string | null },
): T & { conflict: boolean } {
  const reason = result.status === "matched" || result.status === "needs_review" ? reverseContactConflict(result.persons, input) : null;
  if (!reason) return { ...result, conflict: false };
  return { ...result, status: "needs_review", reviewReason: reason, conflict: true };
}
