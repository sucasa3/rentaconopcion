/**
 * BatchData Reverse Skip Trace — Phase 1 (pure logic, no IO).
 *
 * Verified against the official V3 docs (developer.batchdata.com,
 * "Reverse Property Skip Trace", fetched 2026-10-29):
 *
 *   - Endpoint: POST https://api.batchdata.com/api/v3/property/reverse-skip-trace
 *   - Each item takes a phone, an email, or both. US phones only: 10 digits,
 *     or 11 starting with 1; punctuation and a leading +1 are ignored.
 *   - The owner-only option is spelled `propertyOwnersOnly` (plural). Ricky's
 *     closing note said `propertyOwnerOnly` — that spelling is NOT in the docs.
 *   - DISCREPANCY vs Ricky's note: owner-only does NOT cap a lookup at one
 *     result. The filter runs BEFORE the 3-person limit, so one item can
 *     return (and bill) up to 3 owners. Max planning cost per item is
 *     3 × $0.10 = $0.30, not $0.10.
 *   - Billing is per person matched; no matches are not billed. The $0.10
 *     per-result price is a planning term from our arrangement, not documented.
 *   - `mockData: true` exists for testing; we still validate offline with
 *     fixtures so no credential or wallet is touched.
 */

// ---------------------------------------------------------------------------
// Planning terms (configurable; NOT provider-confirmed)
// ---------------------------------------------------------------------------

/** Planning estimate per returned person, in cents. Unverified — see memo. */
export const REVERSE_EST_COST_CENTS_PER_RESULT = 10;

/** Documented maximum persons returned per search item. */
export const REVERSE_MAX_PERSONS_PER_ITEM = 3;

/** Starting estimate of the separate reverse-lookup testing wallet. */
export const REVERSE_WALLET_START_CENTS = 70_000; // ~$700, unverified

/** Property lookup planning terms (separate subscription, tracked apart). */
export const PROPERTY_PLAN = {
  initial: { monthlyCents: 67_500, records: 20_000, perPropertyCents: 3.375 },
  later: { monthlyCents: 100_000, records: 100_000, perPropertyCents: 1 },
} as const;

/** Worst-case planning cost for one combined phone+email item, in cents. */
export const REVERSE_MAX_ITEM_COST_CENTS =
  REVERSE_MAX_PERSONS_PER_ITEM * REVERSE_EST_COST_CENTS_PER_RESULT;

// ---------------------------------------------------------------------------
// Input validation / normalization
// ---------------------------------------------------------------------------

export type NormalizedInput =
  | { ok: true; phone?: string; email?: string }
  | { ok: false; reason: string };

/** US numbers only: 10 digits, or 11 digits starting with 1. */
export function normalizeReversePhone(raw: string | null | undefined):
  | { ok: true; phone: string }
  | { ok: false; reason: string } {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, reason: "empty" };
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) {
    return { ok: false, reason: "US phone numbers need 10 digits" };
  }
  // Area code and exchange cannot start with 0 or 1 in the NANP.
  if (/^[01]/.test(national) || /^... [01]/.test(national.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3"))) {
    return { ok: false, reason: "not a valid US phone number" };
  }
  return { ok: true, phone: national };
}

/** Plain email addresses only — no mailto:, no Markdown link formatting. */
export function normalizeReverseEmail(raw: string | null | undefined):
  | { ok: true; email: string }
  | { ok: false; reason: string } {
  let value = (raw ?? "").trim().toLowerCase();
  if (!value) return { ok: false, reason: "empty" };
  value = value.replace(/^mailto:/, "");
  // Strip Markdown link syntax like [a@b.com](mailto:a@b.com).
  const md = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (md) value = md[2].replace(/^mailto:/, "").trim().toLowerCase();
  if (!/^[^\s@()[\]]+@[^\s@()[\]]+\.[^\s@()[\]]+$/.test(value)) {
    return { ok: false, reason: "not a valid email address" };
  }
  return { ok: true, email: value };
}

/**
 * Validate a contact's phone/email into one reverse-lookup item. At least one
 * valid input is required; invalid present inputs are reported, not sent.
 */
export function buildReverseInput(opts: {
  phone?: string | null;
  email?: string | null;
  requestId: string;
}): NormalizedInput & { invalid?: string[] } {
  const invalid: string[] = [];
  let phone: string | undefined;
  let email: string | undefined;

  if (opts.phone && opts.phone.trim()) {
    const p = normalizeReversePhone(opts.phone);
    if (p.ok) phone = p.phone;
    else invalid.push(`phone: ${p.reason}`);
  }
  if (opts.email && opts.email.trim()) {
    const e = normalizeReverseEmail(opts.email);
    if (e.ok) email = e.email;
    else invalid.push(`email: ${e.reason}`);
  }

  if (!phone && !email) {
    return {
      ok: false,
      reason: invalid.length
        ? `No usable contact input (${invalid.join("; ")})`
        : "Contact has no phone or email on file",
      invalid,
    };
  }
  return { ok: true, phone, email, ...(invalid.length ? { invalid } : {}) };
}

/**
 * The exact outgoing request body. `propertyOwnersOnly: true` is hard-coded
 * server-side for every request in this phase — there is no option to disable
 * it. Phone and email go in ONE combined item: persons matching both rank
 * first and the combined set bills at most 3 persons, which is cheaper than
 * two separate items (each of which could bill up to 3).
 */
export function buildReverseRequestBody(input: {
  requestId: string;
  phone?: string;
  email?: string;
}): Record<string, unknown> {
  const item: Record<string, unknown> = { requestId: input.requestId };
  if (input.phone) item.phone = input.phone;
  if (input.email) item.email = input.email;
  return {
    requests: [item],
    options: {
      propertyOwnersOnly: true,
      includeTCPABlacklistedPhones: true,
      dateFormat: "iso-date",
      showMeta: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Response classification
// ---------------------------------------------------------------------------

export type ReverseStatus =
  | "matched"
  | "needs_review"
  | "no_match"
  | "invalid_input"
  | "provider_error";

export interface ReversePersonSummary {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  propertyOwner: boolean | null;
  addresses: {
    fullAddress: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    rank: number | null;
    propertyMailingAddress: boolean | null;
  }[];
  property: {
    id: string | null;
    fullAddress: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    owners: string[];
  } | null;
  phones: { number: string; type: string | null; dnc: boolean | null; tcpa: boolean | null }[];
  emails: string[];
  litigator: boolean | null;
  deceased: boolean | null;
}

export type NameEvidence = "match" | "partial" | "mismatch" | "unknown";

function nameTokens(value: string | null | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

/**
 * Compare the returned person's name with the contact's name. A name match is
 * supporting evidence only — it NEVER establishes ownership on its own.
 */
export function nameEvidence(
  contactName: string | null | undefined,
  personName: string | null | undefined,
): NameEvidence {
  const contact = nameTokens(contactName);
  const person = nameTokens(personName);
  if (!contact.size || !person.size) return "unknown";
  const overlap = [...person].filter((t) => contact.has(t));
  if (!overlap.length) return "mismatch";
  // Last-name overlap is the strongest single signal available here.
  const contactArr = [...contact];
  const personArr = [...person];
  const lastMatch =
    contactArr.length && personArr.length && contactArr[contactArr.length - 1] === personArr[personArr.length - 1];
  if (lastMatch && overlap.length >= 2) return "match";
  return "partial";
}

/** Extract a privacy-conscious summary of one returned person. */
export function summarizePerson(raw: any): ReversePersonSummary {
  const addr = (a: any) => ({
    fullAddress: a?.fullAddress ?? null,
    street: a?.street ?? null,
    city: a?.city ?? null,
    state: a?.state ?? null,
    zip: a?.zip ?? null,
    rank: typeof a?.rank === "number" ? a.rank : null,
    propertyMailingAddress: typeof a?.propertyMailingAddress === "boolean" ? a.propertyMailingAddress : null,
  });
  const prop = raw?.property
    ? {
        id: raw.property.id ?? null,
        fullAddress: raw.property.address?.fullAddress ?? null,
        street: raw.property.address?.street ?? null,
        city: raw.property.address?.city ?? null,
        state: raw.property.address?.state ?? null,
        zip: raw.property.address?.zip ?? null,
        owners: (raw.property.owners ?? [])
          .map((o: any) => o?.name?.full)
          .filter((n: any) => typeof n === "string" && n.trim()),
      }
    : null;
  return {
    fullName: raw?.name?.full ?? null,
    firstName: raw?.name?.first ?? null,
    lastName: raw?.name?.last ?? null,
    propertyOwner: typeof raw?.propertyOwner === "boolean" ? raw.propertyOwner : null,
    addresses: (raw?.addresses ?? []).map(addr),
    property: prop,
    phones: (raw?.phones ?? []).map((p: any) => ({
      number: String(p?.number ?? ""),
      type: p?.type ?? null,
      dnc: typeof p?.dnc === "boolean" ? p.dnc : null,
      tcpa: typeof p?.tcpa === "boolean" ? p.tcpa : null,
    })),
    emails: (raw?.emails ?? []).map((e: any) => e?.email).filter(Boolean),
    litigator: typeof raw?.litigator === "boolean" ? raw.litigator : null,
    deceased: typeof raw?.deceased === "boolean" ? raw.deceased : null,
  };
}

export interface ReverseClassification {
  status: ReverseStatus;
  persons: ReversePersonSummary[];
  /** True when >1 person returned despite owner-only — held for review. */
  multiPerson: boolean;
  nameEvidence: NameEvidence;
  /** Billable results per the documented per-person billing model. */
  billableResults: number;
  errorMessage: string | null;
  reviewReason: string | null;
}

/**
 * Classify one `result.data[]` item. Pure — takes the parsed response item
 * and the contact's name for identity evidence.
 */
export function classifyReverseItem(
  item: any,
  contactName: string | null | undefined,
): ReverseClassification {
  const meta = item?.meta ?? {};
  if (meta?.error) {
    const msg = String(meta?.errorMessage ?? "Provider rejected this item");
    const isInput = /phone|email|invalid|valid/i.test(msg);
    return {
      status: isInput ? "invalid_input" : "provider_error",
      persons: [],
      multiPerson: false,
      nameEvidence: "unknown",
      billableResults: 0,
      errorMessage: msg,
      reviewReason: null,
    };
  }

  const rawPersons: any[] = Array.isArray(item?.persons) ? item.persons : [];
  if (rawPersons.length === 0) {
    return {
      status: "no_match",
      persons: [],
      multiPerson: false,
      nameEvidence: "unknown",
      billableResults: 0,
      errorMessage: null,
      reviewReason: null,
    };
  }

  const persons = rawPersons.map(summarizePerson);
  const multiPerson = persons.length > 1;
  const first = persons[0];
  const evidence = nameEvidence(contactName, first.fullName);

  // Every returned person is billable per the documented billing model.
  const billableResults = persons.length;

  if (multiPerson) {
    return {
      status: "needs_review",
      persons,
      multiPerson: true,
      nameEvidence: evidence,
      billableResults,
      errorMessage: null,
      reviewReason:
        "More than one property owner matched this contact. Possible associations are preserved; none was selected automatically.",
    };
  }

  if (first.propertyOwner !== true) {
    return {
      status: "needs_review",
      persons,
      multiPerson: false,
      nameEvidence: evidence,
      billableResults,
      errorMessage: null,
      reviewReason:
        "The matched person is not flagged as a property owner at the linked address. Held for review.",
    };
  }

  if (!first.property?.fullAddress && !first.addresses.length) {
    return {
      status: "needs_review",
      persons,
      multiPerson: false,
      nameEvidence: evidence,
      billableResults,
      errorMessage: null,
      reviewReason: "The match carries no property association to act on.",
    };
  }

  if (evidence === "mismatch") {
    return {
      status: "needs_review",
      persons,
      multiPerson: false,
      nameEvidence: evidence,
      billableResults,
      errorMessage: null,
      reviewReason:
        "The returned name does not match the contact's name. A provider match is not independently verified ownership.",
    };
  }

  return {
    status: "matched",
    persons,
    multiPerson: false,
    nameEvidence: evidence,
    billableResults,
    errorMessage: null,
    reviewReason:
      evidence === "partial" || evidence === "unknown"
        ? "Identity evidence is limited — confirm the association before handing off."
        : null,
  };
}

// ---------------------------------------------------------------------------
// Cost + guardrail decisions (pure)
// ---------------------------------------------------------------------------

/** Estimated cost in cents for a classified result. Always labelled estimated. */
export function estimateReverseCostCents(billableResults: number): number {
  return Math.max(0, billableResults) * REVERSE_EST_COST_CENTS_PER_RESULT;
}

/** Server-side monthly spending limit decision, made BEFORE any dispatch. */
export function reverseSpendDecision(opts: {
  usedCentsThisMonth: number;
  capCents: number;
}): { allowed: boolean; reason: string | null } {
  if (opts.usedCentsThisMonth + REVERSE_MAX_ITEM_COST_CENTS > opts.capCents) {
    return {
      allowed: false,
      reason: `Monthly reverse-lookup testing limit reached (est. $${(opts.usedCentsThisMonth / 100).toFixed(2)} of $${(opts.capCents / 100).toFixed(2)} used).`,
    };
  }
  return { allowed: true, reason: null };
}

export interface ReverseLookupRowLike {
  status: string;
  input_phone: string | null;
  input_email: string | null;
  created_at: string;
  review_state?: string;
}

/**
 * Reuse decision: an existing usable result for the same contact and the same
 * normalized inputs, fresh within `windowDays`, avoids another paid call.
 * Errors and stale results never block a deliberate new lookup.
 */
export function findReusableLookup(
  rows: ReverseLookupRowLike[],
  input: { phone?: string; email?: string },
  opts?: { windowDays?: number; now?: number },
): ReverseLookupRowLike | null {
  const windowMs = (opts?.windowDays ?? 30) * 86_400_000;
  const now = opts?.now ?? Date.now();
  for (const row of rows) {
    if (row.status === "provider_error" || row.status === "invalid_input") continue;
    if (now - new Date(row.created_at).getTime() > windowMs) continue;
    const samePhone = (row.input_phone ?? null) === (input.phone ?? null);
    const sameEmail = (row.input_email ?? null) === (input.email ?? null);
    if (samePhone && sameEmail) return row;
  }
  return null;
}

/** True when a lookup is still in flight (double-click / duplicate guard). */
export function isInFlight(row: ReverseLookupRowLike, opts?: { now?: number }): boolean {
  if (row.status !== "pending") return false;
  const now = opts?.now ?? Date.now();
  return now - new Date(row.created_at).getTime() < 2 * 60_000;
}
