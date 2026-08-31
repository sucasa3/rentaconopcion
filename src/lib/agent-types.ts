export interface OwnershipSummary {
  ownerNames: string[];
  ownerOccupied: boolean | null;
  absentee: boolean | null;
  vesting: string | null;
  mailingDiffersFromSite: boolean | null;
}

export interface CharacteristicsSummary {
  beds: number | null;
  baths: number | null;
  livingSqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  garage: number | null;
  pool: boolean | null;
}

export interface TaxTrend {
  latestAssessedValue: number | null;
  latestTaxAmount: number | null;
  taxYear: number | null;
  taxChangePct: number | null;
  assessedToMarketPct: number | null;
}

export type ListingStatus = "off_market" | "active" | "pending" | "sold" | "expired" | "withdrawn";

export interface ListingRow {
  status: ListingStatus;
  list_price_cents: number | null;
  list_date: string | null;
  expiry_date: string | null;
  listed_with_other_agent: boolean;
  listing_agent_name: string | null;
  source: string;
}

export interface MoveScoreInput {
  tenureYears: number | null;
  equityPct: number | null;
  equityDollars: number | null;
  ownerOccupied: boolean | null;
  lastPermitDate: string | null;
  permitTotalValue: number | null;
  taxChangePct: number | null;
  listing: ListingRow | null;
  livingSqft: number | null;
  beds: number | null;
}

export interface AgentSignal {
  kind: "expired_listing" | "listed_elsewhere" | "tenure" | "equity" | "renovation" | "tax_pressure" | "absentee" | "outgrown";
  label: string;
  detail: string;
  weight: number;
  tone: "hot" | "warm" | "info" | "hold";
}

export interface MoveScore {
  score: number;
  band: "hot" | "warm" | "nurture" | "hold";
  signals: AgentSignal[];
  headline: string;
}

export interface ReadinessCheck {
  key: "equity_covers_costs" | "records" | "condition" | "tenure_basis" | "clear_of_listing" | "contactable";
  label: string;
  ok: boolean;
  detail: string;
}

export interface ListingReadiness {
  score: number;
  label: "list-ready" | "prep-needed" | "not-ready";
  netProceeds: number | null;
  checks: ReadinessCheck[];
}
