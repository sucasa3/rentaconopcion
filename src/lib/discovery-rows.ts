/**
 * Discovery row accounting. Pure: decides one outcome for EVERY data row of
 * the uploaded file (before any filtering) so the summary always adds up.
 * Properties and contacts stay distinct; nothing here touches storage.
 */
import type { UploadRow } from "./upload-intake";
import { normalizeEmail, normalizePhone } from "./upload-intake";
import { propertyKey, rowIsValid } from "./discovery";

export type DiscoveryRowOutcome =
  | "property_saved"
  | "contact_saved"
  | "duplicate"
  | "suppressed"
  | "over_allowance"
  | "unusable"
  | "failed";

export interface DiscoveryRowResult {
  row: number;
  name: string | null;
  outcome: DiscoveryRowOutcome;
  reason: string;
  /** "property" | "contact" | null — what this row is, independent of outcome. */
  kind: "property" | "contact" | null;
}

/** Split "123 Main St, Roswell, GA 30075" when city/state/zip columns are empty. */
export function splitCombinedAddress(r: UploadRow): UploadRow {
  const street = r.address ?? "";
  if (!street.includes(",") || (r.city && r.state && r.zip)) return r;
  const parts = street.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return r;
  const m = parts[parts.length - 1].match(/^([A-Za-z]{2})\s*(\d{5})?/);
  if (!m) return r;
  return {
    ...r,
    address: parts.slice(0, -2).join(", "),
    city: r.city || parts[parts.length - 2],
    state: r.state || m[1].toUpperCase(),
    zip: r.zip || m[2] || null,
  };
}

export function asIntakeRow(r: UploadRow) {
  return { full_name: r.name, address: r.address, city: r.city, state: r.state, zip: r.zip, email: r.email };
}

export function contactKey(r: UploadRow): string | null {
  const e = normalizeEmail(r.email);
  if (e) return `email:${e}`;
  const p = normalizePhone(r.phone);
  return p ? `phone:${p}` : null;
}

export interface ClassifyInput {
  rows: UploadRow[];
  existingPropertyKeys: Iterable<string>;
  /** email:/phone: keys already in the book (clients or saved contacts). */
  existingContactKeys: Iterable<string>;
  suppressedRows: Set<number>;
  allowance: number;
}

export function classifyDiscoveryRows(input: ClassifyInput): DiscoveryRowResult[] {
  const props = new Set(input.existingPropertyKeys);
  const contacts = new Set(input.existingContactKeys);
  let accepted = 0;
  return input.rows.map((raw) => {
    const r = splitCombinedAddress(raw);
    const name = r.name?.trim() || null;
    const out = (outcome: DiscoveryRowOutcome, reason: string, kind: DiscoveryRowResult["kind"]) =>
      ({ row: r.rowNumber, name, outcome, reason, kind });
    const hasAddress = rowIsValid(asIntakeRow(r));
    const ck = contactKey(r);
    if (input.suppressedRows.has(r.rowNumber)) {
      return out("suppressed", "This person asked not to be contacted — not saved.", hasAddress ? "property" : ck ? "contact" : null);
    }
    if (hasAddress) {
      const key = propertyKey(asIntakeRow(r));
      if (props.has(key)) return out("duplicate", "This home is already in your book or earlier in this file.", "property");
      props.add(key);
      if (ck) contacts.add(ck);
      if (accepted >= input.allowance) return out("over_allowance", `Beyond your ${input.allowance} free properties — not saved.`, "property");
      accepted += 1;
      return out("property_saved", "Home saved to your book.", "property");
    }
    if (ck) {
      if (contacts.has(ck)) return out("duplicate", "This contact is already in your book or earlier in this file.", "contact");
      contacts.add(ck);
      return out("contact_saved", "Saved as a contact without an address. No property lookup was run.", "contact");
    }
    return out("unusable", name ? "Only a name — no address, phone or email to save." : "No name, address, phone or email.", null);
  });
}

export function countOutcomes(results: DiscoveryRowResult[]) {
  const c: Record<DiscoveryRowOutcome, number> = {
    property_saved: 0, contact_saved: 0, duplicate: 0, suppressed: 0, over_allowance: 0, unusable: 0, failed: 0,
  };
  for (const r of results) c[r.outcome] += 1;
  return c;
}
