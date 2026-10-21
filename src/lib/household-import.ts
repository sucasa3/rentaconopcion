/**
 * Lossless multi-property CSV planner (pure; no I/O, no enrichment, no spend).
 *
 * Every source row gets exactly one explicit outcome. Property identity is the
 * unit-aware street + ZIP5 key from agent-discovery. Contact identity requires
 * the same normalized name AND the same email or phone; a shared name alone
 * never merges people, and a shared email/phone with a different name is held
 * for review instead of being linked. Different people at one address are kept
 * as distinct contacts with role "associated" — never labeled co-borrowers.
 */
import { addressKey } from "./agent-discovery";

export interface ImportSourceRow {
  rowNumber: number;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}
export interface ExistingClient {
  id: string;
  address_line1: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  address_key?: string | null;
}
export interface ExistingContact {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  clientIds: string[];
}

export type RowOutcome =
  | "invalid_address"
  | "suppressed"
  | "exact_duplicate"
  | "existing_property"
  | "new_property"
  | "additional_contact"
  | "needs_review"
  | "waiting_for_capacity";

export interface PlannedRow {
  rowNumber: number;
  outcome: RowOutcome;
  propertyKey: string | null;
  /** Existing client id, or a planned "new:<key>" reference. */
  propertyRef: string | null;
  /** Existing contact id, or a planned "new:<n>" reference. */
  contactRef: string | null;
  role: "primary" | "associated" | null;
  reason: string | null;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const normEmail = (s: string | null | undefined) => norm(s) || null;
const normPhone = (s: string | null | undefined) => {
  const d = (s ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length >= 10 ? ten : null;
};

export function planHouseholdImport(input: {
  rows: ImportSourceRow[];
  existingClients: ExistingClient[];
  existingContacts: ExistingContact[];
  suppressedRowNumbers: ReadonlySet<number>;
  remainingCapacity: number;
}) {
  const propertyByKey = new Map<string, string>(); // key -> ref
  const contactsByProperty = new Map<string, Set<string>>(); // ref -> contact refs
  // Keys shared by 2+ existing clients are ambiguous: never auto-matched.
  const ambiguousKeys = new Set<string>();
  for (const c of input.existingClients) {
    if (!c.address_line1?.trim()) continue;
    const k = c.address_key ?? addressKey({ address: c.address_line1, zip: c.zip ?? null, city: c.city ?? null, state: c.state ?? null });
    const prior = propertyByKey.get(k);
    if (prior && prior !== c.id) ambiguousKeys.add(k);
    else propertyByKey.set(k, c.id);
  }
  for (const k of ambiguousKeys) propertyByKey.delete(k);
  type Contact = { ref: string; name: string; email: string | null; phone: string | null };
  const contacts: Contact[] = input.existingContacts.map((c) => ({
    ref: c.id, name: norm(c.name), email: normEmail(c.email), phone: normPhone(c.phone),
  }));
  for (const c of input.existingContacts)
    for (const id of c.clientIds) {
      const set = contactsByProperty.get(id) ?? new Set<string>();
      set.add(c.id);
      contactsByProperty.set(id, set);
    }

  const seenSignatures = new Set<string>();
  let capacity = Math.max(0, Math.floor(input.remainingCapacity));
  let newContactSeq = 0;
  const out: PlannedRow[] = [];

  for (const row of input.rows) {
    const base = { rowNumber: row.rowNumber, propertyKey: null, propertyRef: null, contactRef: null, role: null, reason: null };
    if (!row.address?.trim() || !row.full_name?.trim()) {
      out.push({ ...base, outcome: "invalid_address", reason: !row.address?.trim() ? "missing_address" : "missing_name" });
      continue;
    }
    if (input.suppressedRowNumbers.has(row.rowNumber)) {
      out.push({ ...base, outcome: "suppressed", reason: "do_not_contact" });
      continue;
    }
    const key = addressKey({ address: row.address, zip: row.zip ?? null, city: row.city ?? null, state: row.state ?? null });
    const name = norm(row.full_name);
    const email = normEmail(row.email);
    const phone = normPhone(row.phone);
    const signature = `${key}|${name}|${email ?? ""}|${phone ?? ""}`;
    if (ambiguousKeys.has(key)) {
      out.push({ ...base, outcome: "needs_review", propertyKey: key, reason: "existing_address_collision" });
      continue;
    }
    if (seenSignatures.has(signature)) {
      out.push({ ...base, outcome: "exact_duplicate", propertyKey: key, reason: "same_property_and_contact_in_file" });
      continue;
    }

    // Contact resolution: email/phone must agree with name; conflicts are held.
    const credentialMatches = contacts.filter(
      (c) => (email && c.email === email) || (phone && c.phone === phone),
    );
    const conflict = credentialMatches.some((c) => c.name !== name);
    if (conflict) {
      seenSignatures.add(signature);
      out.push({ ...base, outcome: "needs_review", propertyKey: key, reason: "shared_email_or_phone_different_name" });
      continue;
    }
    let contact: Contact | undefined = credentialMatches[0];

    let propertyRef = propertyByKey.get(key) ?? null;
    const isNewProperty = propertyRef == null;
    // Without email/phone, the same name only merges within the same property.
    if (!contact && !email && !phone && propertyRef) {
      const onProp = contactsByProperty.get(propertyRef);
      contact = contacts.find((c) => onProp?.has(c.ref) && c.name === name && !c.email && !c.phone);
    }

    if (isNewProperty && capacity <= 0) {
      seenSignatures.add(signature);
      out.push({ ...base, outcome: "waiting_for_capacity", propertyKey: key, reason: "profile_capacity_reached" });
      continue;
    }
    if (isNewProperty) {
      propertyRef = `new:${key}`;
      propertyByKey.set(key, propertyRef);
      capacity -= 1;
    }
    if (!contact) {
      contact = { ref: `new:${++newContactSeq}`, name, email, phone };
      contacts.push(contact);
    }
    const onProp = contactsByProperty.get(propertyRef!) ?? new Set<string>();
    const alreadyLinked = onProp.has(contact.ref);
    const role: "primary" | "associated" = onProp.size === 0 || (alreadyLinked && onProp.size === 1) ? "primary" : "associated";
    onProp.add(contact.ref);
    contactsByProperty.set(propertyRef!, onProp);
    seenSignatures.add(signature);

    const outcome: RowOutcome = isNewProperty
      ? "new_property"
      : alreadyLinked
        ? "existing_property"
        : role === "associated"
          ? "additional_contact"
          : "existing_property";
    out.push({ ...base, outcome, propertyKey: key, propertyRef, contactRef: contact.ref, role, reason: null });
  }

  const counts = out.reduce<Record<RowOutcome, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {} as Record<RowOutcome, number>);
  const placed = out.filter((r) => r.propertyRef);
  return {
    rows: out,
    counts,
    uniqueProperties: new Set(placed.map((r) => r.propertyRef)).size,
    uniqueContacts: new Set(placed.map((r) => r.contactRef)).size,
    newProperties: out.filter((r) => r.outcome === "new_property").length,
  };
}

/**
 * Feature switch: off until the reviewed migration is applied. Off = legacy
 * importer + flat list (presentation + intake rollback only). Switching it off
 * never releases held lookups: the hold lives in the database.
 */
export const HOUSEHOLD_IMPORT_ENABLED = false;
