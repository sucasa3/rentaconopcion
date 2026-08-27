/**
 * BatchData normalizer — pure functions, no server imports.
 *
 * Used ONLY by the isolated BatchData test harness. Nothing here feeds the
 * production ATTOM pipeline or `property_intel`.
 */

export interface ParsedAddress {
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export function parseTestAddress(address: string): ParsedAddress {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const address_line1 = parts[0] ?? "";
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;

  if (parts.length >= 3) {
    city = parts[1] ?? null;
    const m = (parts[2] ?? "").match(/^([A-Za-z]{2})\s*([\d-]{4,})?$/);
    if (m) {
      state = m[1] ?? null;
      zip = m[2] ?? parts[3] ?? null;
    }
  } else if (parts.length === 2) {
    const last = parts[1] ?? "";
    const m = last.match(/^([A-Za-z\s]+?)\s+([A-Za-z]{2})\s+([\d-]{4,})$/);
    if (m) {
      city = (m[1] ?? "").trim();
      state = m[2] ?? null;
      zip = m[3] ?? null;
    } else {
      city = last;
    }
  }

  return { address_line1, city, state, zip };
}

export function normalizeTestAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface NormalizedBatchdataProperty {
  property: {
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    propertyType: string | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    lotSqft: number | null;
    yearBuilt: number | null;
  };
  ownership: {
    ownerName: string | null;
    mailingAddress: string | null;
    ownerOccupied: boolean | null;
    ownershipYears: number | null;
  };
  valuation: {
    estimate: number | null;
    low: number | null;
    high: number | null;
    confidence: number | null;
    asOf: string | null;
    assessedValue: number | null;
    marketValue: number | null;
    taxAmount: number | null;
    taxYear: number | null;
  };
  mortgage: {
    hasRecord: boolean;
    loanAmount: number | null;
    lender: string | null;
    originationDate: string | null;
    interestRate: number | null;
    loanType: string | null;
    termYears: number | null;
    estimatedEquity: number | null;
    openLienCount: number | null;
    totalOpenLienBalance: number | null;
    ltv: number | null;
    equityPercent: number | null;
    estimatedPayment: number | null;
    maturityDate: string | null;
    liens: Array<{
      lender: string | null;
      amount: number | null;
      loanType: string | null;
      termYears: number | null;
      recordingDate: string | null;
      maturityDate: string | null;
      rate: number | null;
      ltv: number | null;
      estimatedPayment: number | null;
    }>;
  };
  sales: {
    lastSaleDate: string | null;
    lastSaleAmount: number | null;
    priorSales: Array<{ date: string | null; amount: number | null; docType: string | null }>;
  };
  permits: {
    count: number;
    totalValue: number | null;
    lastPermitDate: string | null;
    firstPermitDate: string | null;
    tags: string[];
    events: Array<{ date: string | null; type: string | null; description: string | null; value: number | null; status: string | null }>;
  };
  contact: {
    phones: string[];
    emails: string[];
  };
}


type AnyRec = Record<string, any>;

function pick(obj: AnyRec | null | undefined, ...paths: string[]): any {
  if (!obj) return null;
  for (const path of paths) {
    let cur: any = obj;
    for (const seg of path.split(".")) {
      if (cur == null) break;
      cur = cur[seg];
    }
    if (cur != null && cur !== "") return cur;
  }
  return null;
}

function num(v: any): number | null {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.-]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function str(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Pull the first property object out of any of BatchData's response shapes. */
export function firstBatchdataProperty(raw: unknown): AnyRec | null {
  const r = raw as AnyRec | null;
  if (!r || typeof r !== "object") return null;
  const candidates: any[] = [
    r["results"]?.["properties"],
    r["results"]?.["property"],
    r["data"]?.["properties"],
    r["data"]?.["property"],
    r["properties"],
    r["property"],
    Array.isArray(r["data"]) ? r["data"] : null,
    Array.isArray(r["results"]) ? r["results"] : null,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return c[0] as AnyRec;
    if (c && typeof c === "object" && !Array.isArray(c)) return c as AnyRec;
  }
  return null;
}

export function normalizeBatchdataProperty(raw: unknown): NormalizedBatchdataProperty | null {
  const p = firstBatchdataProperty(raw);
  if (!p) return null;

  const salesRows: AnyRec[] = (pick(p, "sales_history", "salesHistory", "sale.history", "intel.salesHistory") as AnyRec[]) ?? [];
  const sales = salesRows
    .map((s) => ({
      date: str(pick(s, "date", "saleDate", "recordingDate")),
      amount: num(pick(s, "amount", "price", "salePrice")),
      docType: str(pick(s, "document_type", "documentType", "deedType")),
    }))
    .filter((s) => s.date || s.amount)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const lastSaleDate = str(pick(p, "sale.lastSaleDate", "sale.saleDate", "lastSaleDate")) ?? sales[0]?.date ?? null;
  const lastSaleAmount = num(pick(p, "sale.lastSalePrice", "sale.price", "lastSalePrice")) ?? sales[0]?.amount ?? null;

  const permitRows: AnyRec[] = (pick(p, "permits", "building.permits") as AnyRec[]) ?? [];
  const permits = permitRows
    .map((r) => ({
      date: str(pick(r, "date", "issueDate", "effectiveDate")),
      type: [str(pick(r, "type", "permitType")), str(pick(r, "sub_type", "subType"))].filter(Boolean).join(" · ") || null,
      description: str(pick(r, "description", "jobDescription")),
      value: num(pick(r, "value", "jobValue", "projectValue")),
      status: str(pick(r, "status")),
    }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const estimate = num(pick(p, "valuation.estimatedValue", "valuation.estimated_value", "valuation.value", "avm.value", "estimatedValue"));
  const loanAmount = num(pick(p, "mortgage.loan_amount", "mortgage.loanAmount", "openLien.totalOpenLienBalance", "mortgage.amount"));

  const phones = ((pick(p, "phoneNumbers", "phone_numbers", "contact.phones") as AnyRec[]) ?? [])
    .map((x) => str(typeof x === "string" ? x : pick(x, "number", "phone")))
    .filter((x): x is string => Boolean(x));
  const emails = ((pick(p, "emails", "contact.emails") as AnyRec[]) ?? [])
    .map((x) => str(typeof x === "string" ? x : pick(x, "email", "address")))
    .filter((x): x is string => Boolean(x));

  return {
    property: {
      addressLine1: str(pick(p, "address.street", "address.address_line1", "address.addressLine1", "address.house")),
      city: str(pick(p, "address.city")),
      state: str(pick(p, "address.state")),
      zip: str(pick(p, "address.zip", "address.zipCode")),
      propertyType: str(pick(p, "general.propertyTypeDetail", "property.property_type", "building.propertyType", "propertyType", "property.use_code")),
      beds: num(pick(p, "building.bedroomCount", "property.bedrooms", "bedrooms")),
      baths: num(pick(p, "building.bathroomCount", "property.bathrooms", "bathrooms")),
      sqft: num(pick(p, "building.totalBuildingAreaSquareFeet", "property.square_feet", "squareFeet")),
      lotSqft: num(pick(p, "lot.lotSizeSquareFeet", "property.lot_size", "lotSize")),
      yearBuilt: num(pick(p, "building.yearBuilt", "property.year_built", "yearBuilt")),
    },
    ownership: {
      ownerName: str(pick(p, "owner.fullName", "owner.name", "owner.owner1FullName")),
      mailingAddress: str(pick(p, "owner.mailingAddress.street", "owner.mailing_address", "owner.mailingAddressFull")),
      ownerOccupied: typeof pick(p, "quickLists.ownerOccupied", "owner.owner_occupied", "owner.ownerOccupied") === "boolean"
        ? Boolean(pick(p, "quickLists.ownerOccupied", "owner.owner_occupied", "owner.ownerOccupied"))
        : null,
      ownershipYears: num(pick(p, "owner.ownershipLengthYears", "ownershipYears")),
    },
    valuation: {
      estimate,
      low: num(pick(p, "valuation.low", "valuation.estimatedValueLow", "avm.low")),
      high: num(pick(p, "valuation.high", "valuation.estimatedValueHigh", "avm.high")),
      confidence: num(pick(p, "valuation.confidence", "valuation.confidenceScore")),
      asOf: str(pick(p, "valuation.value_date", "valuation.asOf", "valuation.date")),
      assessedValue: num(pick(p, "assessment.assessedValue", "assessment.assessed_value", "tax.assessedValue")),
      marketValue: num(pick(p, "assessment.marketValue", "assessment.market_value", "tax.marketValue")),
      taxAmount: num(pick(p, "assessment.taxAmount", "assessment.tax_amount", "tax.taxAmount")),
      taxYear: num(pick(p, "assessment.taxYear", "assessment.tax_year", "tax.year")),
    },
    mortgage: {
      hasRecord: Boolean(loanAmount || pick(p, "mortgage.lender", "mortgage.lenderName")),
      loanAmount,
      lender: str(pick(p, "mortgage.lenderName", "mortgage.lender")),
      originationDate: str(pick(p, "mortgage.recordingDate", "mortgage.date", "mortgage.originationDate")),
      interestRate: num(pick(p, "mortgage.interestRate", "mortgage.interest_rate")),
      loanType: str(pick(p, "mortgage.loanType", "mortgage.loan_type")),
      termYears: num(pick(p, "mortgage.termYears", "mortgage.term_years")),
      estimatedEquity: num(pick(p, "valuation.equityCurrentEstimatedBalance", "valuation.estimatedEquity"))
        ?? (estimate != null && loanAmount != null ? estimate - loanAmount : null),
    },
    sales: { lastSaleDate, lastSaleAmount, priorSales: sales.slice(1) },
    permits: {
      count: permits.length,
      totalValue: permits.reduce((sum, e) => sum + (e.value ?? 0), 0) || null,
      lastPermitDate: permits[0]?.date ?? null,
      events: permits,
    },
    contact: { phones, emails },
  };
}

/** True when BatchData returned something usable, not just an empty envelope. */
export function isMatched(n: NormalizedBatchdataProperty | null): boolean {
  if (!n) return false;
  return Boolean(
    n.property.addressLine1 ||
      n.property.yearBuilt ||
      n.property.sqft ||
      n.valuation.estimate ||
      n.ownership.ownerName ||
      n.mortgage.hasRecord ||
      n.sales.lastSaleDate,
  );
}
