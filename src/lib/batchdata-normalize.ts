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

  // --- Sales -------------------------------------------------------------
  // BatchData emits `sale.lastSale`, `sale.priorSale` and `deedHistory[]`.
  const deedRows: AnyRec[] = (pick(p, "deedHistory", "sales_history", "salesHistory") as AnyRec[]) ?? [];
  const priorSaleObj = pick(p, "sale.priorSale") as AnyRec | null;
  const sales = [
    ...(priorSaleObj
      ? [
          {
            date: str(pick(priorSaleObj, "saleDate", "recordingDate")),
            amount: num(pick(priorSaleObj, "price", "salePrice")),
            docType: str(pick(priorSaleObj, "documentType", "transactionType")),
          },
        ]
      : []),
    ...deedRows.map((s) => ({
      date: str(pick(s, "saleDate", "recordingDate", "date", "documentDate")),
      amount: num(pick(s, "price", "salePrice", "amount")),
      docType: str(pick(s, "documentType", "deedType", "document_type")),
    })),
  ]
    .filter((s) => s.date || s.amount)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const lastSaleDate =
    str(pick(p, "sale.lastSale.saleDate", "sale.lastSale.recordingDate", "intel.lastSoldDate", "sale.lastSaleDate")) ??
    sales[0]?.date ??
    null;
  const lastSaleAmount =
    num(pick(p, "sale.lastSale.price", "intel.lastSoldPrice", "sale.lastTransfer.price", "sale.lastSalePrice")) ??
    sales[0]?.amount ??
    null;

  // --- Permits ------------------------------------------------------------
  // `permit` (singular) is a summary object, not an event list.
  const permitSummary = (pick(p, "permit", "permits") as AnyRec | null) ?? null;
  const permitCount = num(pick(permitSummary, "permitCount")) ?? 0;
  const permitTags = ((pick(permitSummary, "allTags") as string[]) ?? []).filter(Boolean);
  const permitEventRows: AnyRec[] = Array.isArray(permitSummary) ? (permitSummary as AnyRec[]) : [];
  const permitEvents = permitEventRows
    .map((r) => ({
      date: str(pick(r, "date", "issueDate", "effectiveDate")),
      type: [str(pick(r, "type", "permitType")), str(pick(r, "sub_type", "subType"))].filter(Boolean).join(" · ") || null,
      description: str(pick(r, "description", "jobDescription")),
      value: num(pick(r, "value", "jobValue", "projectValue")),
      status: str(pick(r, "status")),
    }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  // --- Valuation & mortgage ----------------------------------------------
  const estimate = num(pick(p, "valuation.estimatedValue", "valuation.value", "avm.value", "estimatedValue"));

  const openLien = (pick(p, "openLien") as AnyRec | null) ?? null;
  const openLienRows: AnyRec[] = (pick(openLien, "mortgages") as AnyRec[]) ?? [];
  const ownershipStart = str(pick(p, "owner.ownershipStartDate"));
  const historyRows: AnyRec[] = ((pick(p, "mortgageHistory") as AnyRec[]) ?? []).filter((m) => {
    const d = str(pick(m, "recordingDate", "documentDate", "saleDate"));
    return !ownershipStart || !d || d >= ownershipStart;
  });

  const liens = (openLienRows.length ? openLienRows : historyRows).map((m) => ({
    lender: str(pick(m, "lenderName", "assignedLenderName")),
    amount: num(pick(m, "loanAmount")),
    loanType: str(pick(m, "loanType")),
    termYears: (() => {
      const months = num(pick(m, "loanTermMonths"));
      return months != null ? Math.round(months / 12) : num(pick(m, "loanTerm")) != null ? Math.round((num(pick(m, "loanTerm")) as number) / 12) : null;
    })(),
    recordingDate: str(pick(m, "recordingDate", "documentDate")),
    maturityDate: str(pick(m, "dueDate")),
    rate: num(pick(m, "currentEstimatedInterestRate", "interestRate")),
    ltv: num(pick(m, "ltv")),
    estimatedPayment: num(pick(m, "estimatedPaymentAmount")),
  }));

  // Primary lien = largest recorded balance among the open liens.
  const primary = [...liens].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0] ?? null;
  const totalOpenLienBalance = num(pick(openLien, "totalOpenLienBalance"));
  const openLienCount = num(pick(openLien, "totalOpenLienCount"));
  const loanAmount = totalOpenLienBalance ?? primary?.amount ?? null;

  const phones = ((pick(p, "phoneNumbers", "phone_numbers", "contact.phones") as AnyRec[]) ?? [])
    .map((x) => str(typeof x === "string" ? x : pick(x, "number", "phone")))
    .filter((x): x is string => Boolean(x));
  const emails = ((pick(p, "emails", "contact.emails") as AnyRec[]) ?? [])
    .map((x) => str(typeof x === "string" ? x : pick(x, "email", "address")))
    .filter((x): x is string => Boolean(x));

  return {
    property: {
      addressLine1: str(pick(p, "address.street", "address.streetNoUnit", "address.address_line1")),
      city: str(pick(p, "address.city")),
      state: str(pick(p, "address.state")),
      zip: str(pick(p, "address.zip", "address.zipCode")),
      propertyType: str(pick(p, "general.propertyTypeDetail", "general.propertyTypeCategory", "building.propertyType", "propertyType")),
      beds: num(pick(p, "building.bedroomCount", "listing.bedroomCount", "bedrooms")),
      baths: num(pick(p, "building.bathroomCount", "building.calculatedBathroomCount", "listing.bathroomCount")),
      sqft: num(pick(p, "building.livingAreaSquareFeet", "building.totalBuildingAreaSquareFeet", "squareFeet")),
      lotSqft: num(pick(p, "lot.lotSizeSquareFeet", "listing.lotSizeSquareFeet", "lotSize")),
      yearBuilt: num(pick(p, "building.yearBuilt", "building.effectiveYearBuilt", "listing.yearBuilt")),
    },
    ownership: {
      ownerName:
        str(pick(p, "owner.fullName", "owner.name")) ??
        str(((pick(p, "owner.names") as AnyRec[]) ?? [])[0]?.["full"]),
      mailingAddress: (() => {
        const m = pick(p, "owner.mailingAddress") as AnyRec | null;
        if (!m) return str(pick(p, "owner.mailing_address"));
        return (
          [str(pick(m, "street")), str(pick(m, "city")), [str(pick(m, "state")), str(pick(m, "zip"))].filter(Boolean).join(" ")]
            .filter(Boolean)
            .join(", ") || null
        );
      })(),
      ownerOccupied:
        typeof pick(p, "owner.ownerOccupied", "quickLists.ownerOccupied") === "boolean"
          ? Boolean(pick(p, "owner.ownerOccupied", "quickLists.ownerOccupied"))
          : null,
      ownershipYears: num(pick(p, "owner.lengthOfResidenceYears", "intel.lengthOfResidenceYears", "owner.ownershipLengthYears")),
    },
    valuation: {
      estimate,
      low: num(pick(p, "valuation.priceRangeMin", "valuation.estimatedValueLow", "valuation.low")),
      high: num(pick(p, "valuation.priceRangeMax", "valuation.estimatedValueHigh", "valuation.high")),
      confidence: num(pick(p, "valuation.confidenceScore", "valuation.confidence")),
      asOf: str(pick(p, "valuation.asOfDate", "valuation.value_date", "valuation.date")),
      assessedValue: num(pick(p, "assessment.totalAssessedValue", "assessment.assessedValue", "tax.assessedValue")),
      marketValue: num(pick(p, "assessment.totalMarketValue", "assessment.marketValue")),
      taxAmount: num(pick(p, "tax.taxAmount", "assessment.taxAmount")),
      taxYear: num(pick(p, "tax.taxYear", "assessment.assessmentYear", "assessment.taxYear")),
    },
    mortgage: {
      hasRecord: Boolean((openLienCount ?? 0) > 0 || loanAmount || primary?.lender || liens.length),
      loanAmount,
      lender: primary?.lender ?? null,
      originationDate: primary?.recordingDate ?? str(pick(openLien, "lastLoanRecordingDate")),
      interestRate: primary?.rate ?? null,
      loanType: primary?.loanType ?? str(((pick(openLien, "allLoanTypes") as string[]) ?? [])[0]),
      termYears: primary?.termYears ?? null,
      estimatedEquity:
        num(pick(p, "valuation.equityCurrentEstimatedBalance", "valuation.estimatedEquity")) ??
        (estimate != null && loanAmount != null ? estimate - loanAmount : null),
      openLienCount,
      totalOpenLienBalance,
      ltv: num(pick(p, "valuation.ltv")) ?? primary?.ltv ?? null,
      equityPercent: num(pick(p, "valuation.equityPercent")),
      estimatedPayment: primary?.estimatedPayment ?? null,
      maturityDate: primary?.maturityDate ?? null,
      liens,
    },
    sales: { lastSaleDate, lastSaleAmount, priorSales: sales },
    permits: {
      count: permitCount || permitEvents.length,
      totalValue: num(pick(permitSummary, "totalJobValue")) ?? (permitEvents.reduce((s, e) => s + (e.value ?? 0), 0) || null),
      lastPermitDate: str(pick(permitSummary, "latestDate")) ?? permitEvents[0]?.date ?? null,
      firstPermitDate: str(pick(permitSummary, "earliestDate")) ?? null,
      tags: permitTags,
      events: permitEvents,
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
