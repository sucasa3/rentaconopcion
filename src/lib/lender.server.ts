// Server-only helpers for lender features.
export type ClientRow = {
  full_name: string;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  email?: string | null;
  loan_balance_cents?: number | null;
  interest_rate_bps?: number | null;
  note?: string | null;
};

/** Split a CSV line honoring quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const norm = (s: string) =>
  s
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const ALIASES: Record<keyof ClientRow | "first_name" | "last_name", string[]> = {
  full_name: ["full_name", "fullname", "name", "client", "client_name", "owner", "owner_name", "homeowner", "contact", "contact_name", "borrower", "borrower_name"],
  first_name: ["first_name", "firstname", "first", "contact_first_name", "owner_first_name", "borrower_first_name"],
  last_name: ["last_name", "lastname", "last", "surname", "contact_last_name", "owner_last_name", "borrower_last_name"],
  address: ["address", "address_1", "address1", "street", "street_address", "property_address", "site_address", "mailing_address", "addr", "full_address", "property_full_address"],
  city: ["city", "property_city", "town", "contact_city"],
  state: ["state", "property_state", "st", "contact_state"],
  zip: ["zip", "zipcode", "zip_code", "postal_code", "postalcode", "property_zip", "contact_zip"],
  email: ["email", "email_address", "e_mail", "contact_email", "primary_email"],

  loan_balance_cents: ["loan_balance", "balance", "loan_amount", "current_balance", "unpaid_balance", "upb"],
  interest_rate_bps: ["rate", "interest_rate", "note_rate", "apr"],
  note: ["note", "notes", "comment", "comments"],
};

function findCol(header: string[], key: keyof typeof ALIASES): number {
  for (const a of ALIASES[key]) {
    const i = header.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

const num = (v?: string) => {
  if (!v) return null;
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export function parseClientCsv(csv: string): ClientRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Some exports have title/blank rows before the real header — find the first
  // row that looks like a header with a name and an address column.
  let headerIdx = -1;
  let header: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cells = splitCsvLine(lines[i]).map(norm);
    const hasName = findCol(cells, "full_name") >= 0 || findCol(cells, "last_name") >= 0;
    const hasAddr = findCol(cells, "address") >= 0;
    if (hasName && hasAddr) {
      headerIdx = i;
      header = cells;
      break;
    }
  }

  if (headerIdx < 0) {
    const first = splitCsvLine(lines[0]).map((c) => c.trim()).filter(Boolean).join(", ");
    throw new Error(
      `Couldn't find a name column and an address column in that file. Found columns: ${first || "(none)"}. Rename them to full_name and address (or download the template) and try again.`,
    );
  }

  const cFull = findCol(header, "full_name");
  const cFirst = findCol(header, "first_name");
  const cLast = findCol(header, "last_name");
  const cAddr = findCol(header, "address");
  const cCity = findCol(header, "city");
  const cState = findCol(header, "state");
  const cZip = findCol(header, "zip");
  const cEmail = findCol(header, "email");
  const cLoan = findCol(header, "loan_balance_cents");
  const cRate = findCol(header, "interest_rate_bps");
  const cNote = findCol(header, "note");

  const out: ClientRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const name =
      (cFull >= 0 ? cells[cFull] : "") ||
      [cFirst >= 0 ? cells[cFirst] : "", cLast >= 0 ? cells[cLast] : ""].filter(Boolean).join(" ");
    const loan = cLoan >= 0 ? num(cells[cLoan]) : null;
    const rate = cRate >= 0 ? num(cells[cRate]) : null;
    let street = (cells[cAddr] ?? "").trim();
    let city = cCity >= 0 ? cells[cCity] || null : null;
    let state = cState >= 0 ? cells[cState] || null : null;
    let zip = cZip >= 0 ? cells[cZip] || null : null;
    // Single combined address column ("123 Main St, Roswell, GA 30075")
    if (street.includes(",") && (!city || !state || !zip)) {
      const parts = street.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        const tail = parts[parts.length - 1];
        const m = tail.match(/^([A-Za-z]{2})\s*(\d{5})?/);
        if (m) {
          state = state || m[1].toUpperCase();
          zip = zip || m[2] || null;
          city = city || parts[parts.length - 2];
          street = parts.slice(0, parts.length - 2).join(", ");
        }
      }
    }
    const row: ClientRow = {
      full_name: (name ?? "").trim(),
      address: street,
      city,
      state,
      zip,
      email: cEmail >= 0 ? cells[cEmail] || null : null,
      loan_balance_cents: loan != null ? Math.round(loan * 100) : null,
      interest_rate_bps: rate != null ? Math.round(rate * 100) : null,
      note: cNote >= 0 ? cells[cNote] || null : null,
    };
    if (row.full_name && row.address) out.push(row);

  }
  return out;
}
