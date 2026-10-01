/**
 * Agent Discovery — pure helpers (no I/O).
 *
 * Property identity is the normalized full street address INCLUDING the unit,
 * plus the 5-digit ZIP. Contacts are a separate concept: two different
 * properties that share an email are never merged.
 */

export interface AgentIntakeRow {
  full_name: string;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  email?: string | null;
  note?: string | null;
}

const SUFFIX: Record<string, string> = {
  street: "st", st: "st", avenue: "ave", ave: "ave", road: "rd", rd: "rd",
  drive: "dr", dr: "dr", lane: "ln", ln: "ln", court: "ct", ct: "ct",
  boulevard: "blvd", blvd: "blvd", place: "pl", pl: "pl", circle: "cir", cir: "cir",
  parkway: "pkwy", pkwy: "pkwy", highway: "hwy", hwy: "hwy", terrace: "ter", ter: "ter",
  trail: "trl", trl: "trl", way: "way",
  north: "n", n: "n", south: "s", s: "s", east: "e", e: "e", west: "w", w: "w",
  apartment: "unit", apt: "unit", unit: "unit", suite: "unit", ste: "unit", "#": "unit",
};

/** Normalized street incl. unit: "123 Main Street, Apt. 4B" -> "123 main st unit 4b". */
export function normalizeStreet(street: string): string {
  return street
    .toLowerCase()
    .replace(/#\s*/g, " # ")
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => SUFFIX[t] ?? t)
    // "unit unit 4" (e.g. "Apt #4") collapses to one marker
    .filter((t, i, arr) => !(t === "unit" && arr[i - 1] === "unit"))
    .join(" ");
}

/** Property key: street incl. unit + ZIP5 (falls back to city/state when ZIP is absent). */
export function addressKey(row: Pick<AgentIntakeRow, "address" | "zip" | "city" | "state">): string {
  const street = normalizeStreet(row.address ?? "");
  const zip = (row.zip ?? "").replace(/\D/g, "").slice(0, 5);
  const area = zip || [row.city, row.state].map((p) => (p ?? "").trim().toLowerCase()).join("|");
  return `${street}|${area}`;
}

export interface AgentIntakePlan<T> {
  /** Rows to import now, within the remaining allowance. */
  toImport: (T & { address_key: string })[];
  /** Valid, new properties above the allowance — held, never enriched. */
  overAllowance: (T & { address_key: string })[];
  /** Same property already in this book or repeated in the file. */
  duplicateProperties: number;
  /** New properties whose email also appears on another row/property (kept separate). */
  sharedContactRows: number;
}

export function planAgentIntake<T extends AgentIntakeRow>(
  rows: T[],
  opts: { existingKeys: Iterable<string>; remaining: number | null },
): AgentIntakePlan<T> {
  const seen = new Set(opts.existingKeys);
  const emails = new Map<string, number>();
  for (const r of rows) {
    const e = (r.email ?? "").trim().toLowerCase();
    if (e) emails.set(e, (emails.get(e) ?? 0) + 1);
  }
  const unique: (T & { address_key: string })[] = [];
  let duplicateProperties = 0;
  let sharedContactRows = 0;
  for (const r of rows) {
    const key = addressKey(r);
    if (seen.has(key)) {
      duplicateProperties += 1;
      continue;
    }
    seen.add(key);
    const e = (r.email ?? "").trim().toLowerCase();
    if (e && (emails.get(e) ?? 0) > 1) sharedContactRows += 1;
    unique.push({ ...r, address_key: key });
  }
  const cap = opts.remaining == null ? unique.length : Math.max(0, opts.remaining);
  return {
    toImport: unique.slice(0, cap),
    overAllowance: unique.slice(cap),
    duplicateProperties,
    sharedContactRows,
  };
}

/** E.164 for US/intl input. Returns null when the number can't be normalized. */
export function toE164(raw: string, defaultCountry = "1"): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (plus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** License pair key: "GA|123456" (uppercase, alphanumerics only). Not proof of licensure. */
export function licenseKey(number?: string | null, state?: string | null): string | null {
  const n = (number ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const s = (state ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  return n && s.length === 2 ? `${s}|${n}` : null;
}

/** Total plan capacity includes the free base; the ledger holds base + (plan - base). */
export function planCapacityTopUp(planProfiles: number | null | undefined, base = 100): number {
  return Math.max(0, (planProfiles ?? 0) - base);
}

/** Which profiles to archive when capacity drops: everything not kept, never more than needed. */
export function selectArchive(activeIds: string[], keepIds: string[], capacity: number): string[] {
  const keep = new Set(keepIds.filter((id) => activeIds.includes(id)));
  if (keep.size > capacity) throw new Error(`Choose at most ${capacity} profiles to keep.`);
  return activeIds.filter((id) => !keep.has(id));
}
