/**
 * Mixed-list upload planner (agent + lender). Pure and offline: it decides an
 * outcome for EVERY uploaded row and never touches storage or providers.
 *
 * NOT wired into the live importers yet — preview shares the live database,
 * so wiring waits for an isolated database and Neil's approval.
 */

export type UploadRole = "agent" | "lender";

export type RowOutcome =
  | "added_cached" //       fits capacity, saved property record reused (no spend)
  | "added_needs_lookup" // fits capacity, paid property lookup awaiting batch approval
  | "added_lookup_approved" // fits capacity, covered by the approved batch budget
  | "contact_only" //       no address but a phone/email — kept, no Home Profile used
  | "waiting_capacity" //   kept, waits for Home Profile capacity
  | "duplicate_in_file" //  same person/home earlier in this file
  | "already_uploaded" //   already in the book from an earlier upload
  | "unusable"; //          no address, phone or email (or blank line)

export interface UploadRow {
  rowNumber: number; // 1-based line in the file, header excluded
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  email: string | null;
  phone: string | null;
  loanBalanceCents: number | null;
  interestRateBps: number | null;
}

export interface RowResult {
  rowNumber: number;
  outcome: RowOutcome;
  key: string | null;
  reason: string;
}

export interface UploadPlanInput {
  role: UploadRole;
  rows: UploadRow[];
  /** Identity keys already in the book (earlier uploads, manual adds, staged rows). */
  existingKeys: Set<string>;
  /** Normalized address keys with a usable saved property record. */
  cachedAddressKeys: Set<string>;
  /** Home Profiles still available in this book/org. */
  capacityRemaining: number;
  /** Batch spending approval: max paid property lookups allowed (0 = none approved). */
  approvedLookups: number;
  /** Planning estimate per paid property lookup, in cents. */
  lookupCostCents: number;
}

export interface UploadPlan {
  role: UploadRole;
  results: RowResult[];
  counts: Record<RowOutcome, number>;
  spend: {
    lookupsNeeded: number;
    lookupsApproved: number;
    estimatedCentsNeeded: number;
    estimatedCentsApproved: number;
    approvalRequired: boolean;
  };
}

const clean = (s: string | null | undefined) => (s ?? "").trim();

export function normalizeEmail(e: string | null | undefined): string | null {
  const v = clean(e).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

export function normalizePhone(p: string | null | undefined): string | null {
  let d = clean(p).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

const STREET_ABBR: Record<string, string> = {
  street: "st", avenue: "ave", road: "rd", drive: "dr", lane: "ln", court: "ct",
  boulevard: "blvd", circle: "cir", place: "pl", trail: "trl", parkway: "pkwy",
  highway: "hwy", terrace: "ter", north: "n", south: "s", east: "e", west: "w",
};

export function addressKey(r: Pick<UploadRow, "address" | "zip" | "city" | "state">): string | null {
  const street = clean(r.address)
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_ABBR[w] ?? w)
    .join(" ");
  if (!street) return null;
  const zip = clean(r.zip).slice(0, 5);
  const place = zip || [clean(r.city), clean(r.state)].join(",").toLowerCase();
  if (!place.replace(/,/g, "")) return null;
  return `addr:${street}|${place}`;
}

/** Identity: the home when an address is present, otherwise the person's contact. */
export function identityKey(r: UploadRow): string | null {
  const a = addressKey(r);
  if (a) return a;
  const e = normalizeEmail(r.email);
  if (e) return `email:${e}`;
  const p = normalizePhone(r.phone);
  return p ? `phone:${p}` : null;
}

export function planUpload(input: UploadPlanInput): UploadPlan {
  const results: RowResult[] = [];
  const seen = new Set<string>();
  let capacity = Math.max(0, input.capacityRemaining);
  let approvedLeft = Math.max(0, input.approvedLookups);
  let needed = 0;
  let approved = 0;

  for (const row of input.rows) {
    const key = identityKey(row);
    const push = (outcome: RowOutcome, reason: string) =>
      results.push({ rowNumber: row.rowNumber, outcome, key, reason });

    if (!key) {
      push("unusable", "No address, phone or email to work with.");
      continue;
    }
    if (seen.has(key)) {
      push("duplicate_in_file", "Same home or contact appears earlier in this file.");
      continue;
    }
    seen.add(key);
    if (input.existingKeys.has(key)) {
      push("already_uploaded", "Already in your book — nothing added, nothing charged.");
      continue;
    }
    if (!key.startsWith("addr:")) {
      push("contact_only", "Kept without an address; a home can be found later with approval.");
      continue;
    }
    if (capacity <= 0) {
      push("waiting_capacity", "Kept and waiting for Home Profile capacity.");
      continue;
    }
    capacity -= 1;
    if (input.cachedAddressKeys.has(key)) {
      push("added_cached", "Saved property record reused — no lookup cost.");
    } else if (approvedLeft > 0) {
      approvedLeft -= 1;
      needed += 1;
      approved += 1;
      push("added_lookup_approved", "Property lookup covered by the approved batch.");
    } else {
      needed += 1;
      push("added_needs_lookup", "Property lookup waits for batch spending approval.");
    }
  }

  const counts = Object.fromEntries(
    (
      ["added_cached", "added_needs_lookup", "added_lookup_approved", "contact_only", "waiting_capacity",
        "duplicate_in_file", "already_uploaded", "unusable"] as RowOutcome[]
    ).map((o) => [o, results.filter((r) => r.outcome === o).length]),
  ) as Record<RowOutcome, number>;

  return {
    role: input.role,
    results,
    counts,
    spend: {
      lookupsNeeded: needed,
      lookupsApproved: approved,
      estimatedCentsNeeded: needed * input.lookupCostCents,
      estimatedCentsApproved: approved * input.lookupCostCents,
      approvalRequired: needed > approved,
    },
  };
}

// ---------------------------------------------------------------- CSV parsing

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const COLS: Record<string, string[]> = {
  name: ["full_name", "name", "client_name", "contact", "homeowner"],
  first: ["first_name", "first"],
  last: ["last_name", "last"],
  address: ["address", "street", "address_line1", "property_address", "street_address"],
  city: ["city"],
  state: ["state", "st"],
  zip: ["zip", "zipcode", "postal_code", "zip_code"],
  email: ["email", "email_address", "e_mail"],
  phone: ["phone", "mobile", "cell", "phone_number", "telephone"],
  loan: ["loan_balance", "loan_balance_cents", "balance"],
  rate: ["interest_rate", "interest_rate_bps", "rate"],
};
const normH = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Lenient parser: every non-blank data line becomes a row (none silently dropped). */
export function parseUploadCsv(csv: string): { rows: UploadRow[]; blankLines: number } {
  const lines = csv.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim().length > 0);
  if (headerIdx < 0) return { rows: [], blankLines: 0 };
  const header = splitLine(lines[headerIdx]).map(normH);
  const col = (k: string) => header.findIndex((h) => COLS[k].includes(h));
  const c = Object.fromEntries(Object.keys(COLS).map((k) => [k, col(k)])) as Record<string, number>;
  const rows: UploadRow[] = [];
  let blank = 0;
  let n = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) { blank++; continue; }
    n++;
    const cells = splitLine(lines[i]);
    const get = (k: string) => (c[k] >= 0 ? cells[c[k]] || null : null);
    const num = (v: string | null) => {
      if (!v) return null;
      const x = Number(v.replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(x) ? x : null;
    };
    const loan = num(get("loan"));
    const rate = num(get("rate"));
    rows.push({
      rowNumber: n,
      name: clean(get("name")) || [get("first"), get("last")].filter(Boolean).join(" ").trim(),
      address: clean(get("address")),
      city: get("city"),
      state: get("state"),
      zip: get("zip"),
      email: get("email"),
      phone: get("phone"),
      loanBalanceCents: loan != null ? Math.round(loan * 100) : null,
      interestRateBps: rate != null ? Math.round(rate * 100) : null,
    });
  }
  return { rows, blankLines: blank };
}

// ---------------------------------------------------------------- feature flag

/**
 * Off by default. Enabled only for user ids listed in the server secret
 * MIXED_UPLOAD_USER_IDS (comma-separated). "off"/blank/unset = nobody.
 */
export function mixedUploadEnabledFor(userId: string, raw: string | undefined | null): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v || v === "off") return false;
  return v.split(/[\s,]+/).includes(userId.toLowerCase());
}

/** Rows sent to stage_mixed_upload: only planner proposals, never approvals. */
export function stagePayload(
  plan: UploadPlan,
  rows: UploadRow[],
  legacyAddressKey: (r: UploadRow) => string,
  suppressedRowNumbers: Set<number> = new Set(),
) {
  const byNum = new Map(rows.map((r) => [r.rowNumber, r]));
  return plan.results.map((res) => {
    const r = byNum.get(res.rowNumber)!;
    const outcome = suppressedRowNumbers.has(res.rowNumber)
      ? "suppressed"
      : res.outcome === "added_lookup_approved" ? "added_needs_lookup" : res.outcome;
    return {
      row_number: res.rowNumber,
      outcome,
      identity_key: res.key,
      cached: res.outcome === "added_cached",
      payload: outcome === "suppressed" ? {} : {
        name: r.name || null, address: r.address || null, city: r.city, state: r.state, zip: r.zip,
        email: r.email, phone: r.phone, loan_balance_cents: r.loanBalanceCents,
        interest_rate_bps: r.interestRateBps, address_key: r.address ? legacyAddressKey(r) : null,
      },
    };
  });
}
