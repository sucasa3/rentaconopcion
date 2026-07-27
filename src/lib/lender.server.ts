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

export function parseClientCsv(csv: string): ClientRow[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.indexOf(k);
  const cFull = idx("full_name");
  const cAddr = idx("address");
  const cCity = idx("city");
  const cState = idx("state");
  const cZip = idx("zip");
  const cEmail = idx("email");
  const cLoan = idx("loan_balance");
  const cRate = idx("rate");
  const cNote = idx("note");
  if (cFull < 0 || cAddr < 0) throw new Error("CSV must include full_name and address columns");

  const out: ClientRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const row: ClientRow = {
      full_name: cells[cFull] ?? "",
      address: cells[cAddr] ?? "",
      city: cCity >= 0 ? cells[cCity] || null : null,
      state: cState >= 0 ? cells[cState] || null : null,
      zip: cZip >= 0 ? cells[cZip] || null : null,
      email: cEmail >= 0 ? cells[cEmail] || null : null,
      loan_balance_cents:
        cLoan >= 0 && cells[cLoan]
          ? Math.round(Number(cells[cLoan].replace(/[^0-9.]/g, "")) * 100)
          : null,
      interest_rate_bps:
        cRate >= 0 && cells[cRate]
          ? Math.round(Number(cells[cRate].replace(/[^0-9.]/g, "")) * 100)
          : null,
      note: cNote >= 0 ? cells[cNote] || null : null,
    };
    if (row.full_name && row.address) out.push(row);
  }
  return out;
}
