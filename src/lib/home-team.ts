/**
 * Home Team candidate extraction — pure, provider-agnostic, no server imports.
 *
 * A property record can only ever be EVIDENCE. Nothing in this file confirms a
 * relationship, grants access, or invents a person: institution names may
 * become `lender_organization` candidates, and an individual loan officer is
 * NEVER derived from an institution because no provider field carries one.
 *
 * Quality first: a candidate that fails the rules below is suppressed with a
 * recorded reason rather than polluting the relationship graph. "No candidate"
 * always beats a bad one.
 */

export type HomeTeamRole = "lender_organization" | "closing_organization";

export interface HomeTeamCandidate {
  role: HomeTeamRole;
  /** Cleaned display name for the institution. */
  name: string;
  /** Exactly what the provider returned, kept for audit. */
  rawName: string;
  source: "batchdata_mortgage";
  /** `detected` until SuCasa surfaces it for human review. */
  status: "detected";
  /** 0–1, from the strength of the underlying lien evidence. */
  confidence: number;
  evidence: {
    lienKind: "open_lien" | "mortgage_history";
    recordingDate: string | null;
    loanType: string | null;
    openLienCount: number | null;
  };
}

export interface SuppressedCandidate {
  rawName: string | null;
  reason: SuppressionReason;
}

export type SuppressionReason =
  | "empty"
  | "too_short"
  | "no_letters"
  | "generic_placeholder"
  | "not_a_lending_entity"
  | "individual_name_not_institution"
  | "duplicate";

export interface HomeTeamCandidateResult {
  candidates: HomeTeamCandidate[];
  suppressed: SuppressedCandidate[];
}

/** Values that carry no institution at all. */
const PLACEHOLDER_SET = new Set([
  "n/a",
  "na",
  "none",
  "null",
  "unknown",
  "not available",
  "not provided",
  "no lender",
  "lender",
  "bank",
  "mortgage",
  "individual",
  "private party",
  "private lender",
  "seller",
  "owner",
  "various",
  "multiple",
  "other",
  "test",
]);


/**
 * Entities that appear in recorded-lien data but are not the homeowner's
 * mortgage provider. Insurance/bond, tax and government entities are the
 * observed noise in our stored provider responses.
 */
const NON_LENDING_MARKERS = [
  "insurance",
  "assurance",
  "bonds",
  "bonding",
  "surety",
  "title agency",
  "tax commissioner",
  "department of",
  "internal revenue",
  "irs",
  "county of",
  "city of",
  "state of",
  "clerk of",
  "homeowners association",
  "hoa",
  "condominium association",
  "utility",
  "water authority",
  "solar lease",
  "attorney at law",
];

/** Tokens that make a string read as a real lending institution. */
const LENDING_MARKERS = [
  "mortgage",
  "mtg",
  "bank",
  "bk",
  "credit union",
  "cu",
  "lending",
  "lenders",
  "loans",
  "loan",
  "financial",
  "finance",
  "funding",
  "capital",
  "savings",
  "federal",
  "fsb",
  "trust",
  "wholesale",
  "home lending",
  "hm lndg",
  "residential",
  "financing",
  "escrow",
];

const LEGAL_SUFFIX_MARKERS = ["inc", "llc", "llp", "lp", "corp", "co", "company", "group", "assn"];

/** Collapse provider casing/punctuation noise without losing the name. */
export function cleanInstitutionName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[.,]+$/g, "")
    .trim()
    .replace(/\b([A-Za-z]{2,})\b/g, (w) =>
      w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w,
    );
}

/** Stable key used to de-duplicate institution strings within one property. */
export function institutionKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(inc|llc|llp|lp|corp|co|company|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reason this string cannot become a candidate, or `null` when it passes. */
export function institutionSuppressionReason(raw: string | null | undefined): SuppressionReason | null {
  const value = (raw ?? "").trim();
  if (!value) return "empty";
  if (!/[a-z]/i.test(value)) return "no_letters";

  const key = institutionKey(value);
  // Placeholders are checked before length so "N/A" reads as a placeholder.
  if (!key || PLACEHOLDER_SET.has(key)) return "generic_placeholder";
  if (value.replace(/[^a-z0-9]/gi, "").length < 4) return "too_short";

  const lower = ` ${key} `;
  if (NON_LENDING_MARKERS.some((m) => lower.includes(` ${m} `) || key.includes(m))) {
    return "not_a_lending_entity";
  }

  const tokens = key.split(" ").filter(Boolean);
  const hasLendingMarker =
    LENDING_MARKERS.some((m) => (m.includes(" ") ? key.includes(m) : tokens.includes(m))) ||
    // Bank charter suffix, only when it actually trails the name ("... Bank N A").
    /\bn\s?a$/.test(key);

  if (!hasLendingMarker) {
    const hasLegalSuffix = LEGAL_SUFFIX_MARKERS.some((m) => tokens.includes(m));
    // Two or three bare words with no lending or corporate marker reads as a
    // person, not an institution. Prefer no candidate.
    if (!hasLegalSuffix) return "individual_name_not_institution";
  }
  return null;
}

export interface MortgageEvidenceInput {
  openLienCount: number | null;
  liens: Array<{ lender: string | null; recordingDate: string | null; loanType: string | null }>;
  history: Array<{ lender: string | null; recordingDate: string | null; loanType: string | null }>;
}

/**
 * Build lender-organization candidates from one normalized property record.
 *
 * Open liens are stronger evidence than payoff history and are ranked first.
 * No MLO, attorney or title candidate is ever produced: the stored provider
 * responses contain no field that supports one.
 */
export function buildHomeTeamCandidates(input: MortgageEvidenceInput): HomeTeamCandidateResult {
  const candidates: HomeTeamCandidate[] = [];
  const suppressed: SuppressedCandidate[] = [];
  const seen = new Set<string>();

  const rows: Array<{ kind: "open_lien" | "mortgage_history"; row: MortgageEvidenceInput["liens"][number] }> = [
    ...input.liens.map((row) => ({ kind: "open_lien" as const, row })),
    ...input.history.map((row) => ({ kind: "mortgage_history" as const, row })),
  ];

  for (const { kind, row } of rows) {
    const raw = (row.lender ?? "").trim();
    const reason = institutionSuppressionReason(raw);
    if (reason) {
      suppressed.push({ rawName: raw || null, reason });
      continue;
    }
    const key = institutionKey(raw);
    if (seen.has(key)) {
      suppressed.push({ rawName: raw, reason: "duplicate" });
      continue;
    }
    seen.add(key);
    candidates.push({
      role: "lender_organization",
      name: cleanInstitutionName(raw),
      rawName: raw,
      source: "batchdata_mortgage",
      status: "detected",
      confidence: kind === "open_lien" ? 0.7 : 0.4,
      evidence: {
        lienKind: kind,
        recordingDate: row.recordingDate ?? null,
        loanType: row.loanType ?? null,
        openLienCount: input.openLienCount ?? null,
      },
    });
  }

  return { candidates, suppressed };
}
