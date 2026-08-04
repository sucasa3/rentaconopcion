/**
 * Agent intelligence layer.
 *
 * Pure functions only — no network, no Supabase. Everything here runs on
 * ATTOM data we have ALREADY cached in `property_intel` plus the listing
 * status we track ourselves, so scoring a whole book of business costs $0.
 *
 * The lender side asks "can this loan be improved?".
 * The agent side asks "how likely is this household to move, and what's my
 * opening line?".
 */

// ---------------------------------------------------------------------------
// Extractors for ATTOM classes the lender flow never needed.
// ---------------------------------------------------------------------------

export interface OwnershipSummary {
  ownerNames: string[];
  ownerOccupied: boolean | null;
  absentee: boolean | null;
  vesting: string | null;
  mailingDiffersFromSite: boolean | null;
}

export function extractOwnership(raw: unknown): OwnershipSummary {
  const p = (raw as any)?.property?.[0] ?? null;
  const owner = p?.owner ?? {};
  const names: string[] = [];
  for (const key of ["owner1", "owner2", "owner3", "owner4"]) {
    const o = owner?.[key];
    if (!o) continue;
    const name =
      typeof o === "string"
        ? o
        : [o.firstnameandmi ?? o.firstname, o.lastname].filter(Boolean).join(" ");
    if (name && name.trim()) names.push(name.trim());
  }
  const absenteeInd: string | null = p?.summary?.absenteeInd ?? null;
  const absentee = absenteeInd ? /absentee/i.test(absenteeInd) : null;
  const mailing = p?.address?.mailingAddressOneLine ?? null;
  const site = p?.address?.oneLine ?? null;

  return {
    ownerNames: names,
    ownerOccupied: absentee == null ? null : !absentee,
    absentee,
    vesting: owner?.corporateindicator === "Y" ? "entity" : owner?.type ?? null,
    mailingDiffersFromSite:
      mailing && site ? mailing.trim().toLowerCase() !== site.trim().toLowerCase() : null,
  };
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

export function extractCharacteristics(raw: unknown): CharacteristicsSummary {
  const p = (raw as any)?.property?.[0] ?? null;
  const b = p?.building ?? {};
  return {
    beds: b?.rooms?.beds ?? null,
    baths: b?.rooms?.bathstotal ?? b?.rooms?.bathsfull ?? null,
    livingSqft: b?.size?.livingsize ?? b?.size?.universalsize ?? null,
    lotSqft: p?.lot?.lotsize2 ?? null,
    yearBuilt: p?.summary?.yearbuilt ?? b?.summary?.yearbuilteffective ?? null,
    propertyType: p?.summary?.proptype ?? p?.summary?.propclass ?? null,
    garage: b?.parking?.prkgSize ?? null,
    pool: p?.lot?.pooltype ? p.lot.pooltype !== "NO POOL" : null,
  };
}

export interface TaxTrend {
  latestAssessedValue: number | null;
  latestTaxAmount: number | null;
  taxYear: number | null;
  taxChangePct: number | null; // year over year
  assessedToMarketPct: number | null;
}

export function extractTaxTrend(raw: unknown, marketValue: number | null): TaxTrend {
  const p = (raw as any)?.property?.[0] ?? null;
  const assessment = p?.assessment ?? {};
  const history: any[] = Array.isArray((raw as any)?.property)
    ? (raw as any).property
        .map((row: any) => row?.assessment?.tax)
        .filter(Boolean)
    : [];
  const latestTax = assessment?.tax?.taxamt ?? history[0]?.taxamt ?? null;
  const prevTax = history[1]?.taxamt ?? null;
  const assessed = assessment?.assessed?.assdttlvalue ?? null;

  return {
    latestAssessedValue: assessed ?? null,
    latestTaxAmount: latestTax ?? null,
    taxYear: assessment?.tax?.taxyear ?? null,
    taxChangePct:
      latestTax && prevTax ? Math.round(((latestTax - prevTax) / prevTax) * 1000) / 10 : null,
    assessedToMarketPct:
      assessed && marketValue ? Math.round((assessed / marketValue) * 1000) / 10 : null,
  };
}

// ---------------------------------------------------------------------------
// Listing status (ours — sourced from Fello events, MLS later, or manual)
// ---------------------------------------------------------------------------

export type ListingStatus =
  | "off_market"
  | "active"
  | "pending"
  | "sold"
  | "expired"
  | "withdrawn";

export interface ListingRow {
  status: ListingStatus;
  list_price_cents: number | null;
  list_date: string | null;
  expiry_date: string | null;
  listed_with_other_agent: boolean;
  listing_agent_name: string | null;
  source: string;
}

// ---------------------------------------------------------------------------
// Move score
// ---------------------------------------------------------------------------

export interface MoveScoreInput {
  tenureYears: number | null;
  equityPct: number | null; // 0..1
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
  kind:
    | "expired_listing"
    | "listed_elsewhere"
    | "tenure"
    | "equity"
    | "renovation"
    | "tax_pressure"
    | "absentee"
    | "outgrown";
  label: string;
  detail: string;
  weight: number;
  tone: "hot" | "warm" | "info" | "hold";
}

export interface MoveScore {
  score: number; // 0..100
  band: "hot" | "warm" | "nurture" | "hold";
  signals: AgentSignal[];
  headline: string;
}

function yearsSince(date: string | null): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (365.25 * 24 * 3600 * 1000);
}

export function computeMoveScore(input: MoveScoreInput): MoveScore {
  const signals: AgentSignal[] = [];
  let score = 0;

  const listing = input.listing;

  // Compliance first: never prospect a home actively listed with another agent.
  if (listing && listing.listed_with_other_agent && (listing.status === "active" || listing.status === "pending")) {
    signals.push({
      kind: "listed_elsewhere",
      label: "Listed with another agent",
      detail:
        listing.listing_agent_name
          ? `Represented by ${listing.listing_agent_name}. Quiet mode — no solicitation.`
          : "Quiet mode — value-only touches, no solicitation.",
      weight: 0,
      tone: "hold",
    });
    return {
      score: 0,
      band: "hold",
      signals,
      headline: "Quiet mode — currently represented",
    };
  }

  if (listing && (listing.status === "expired" || listing.status === "withdrawn")) {
    const w = 40;
    score += w;
    signals.push({
      kind: "expired_listing",
      label: listing.status === "expired" ? "Listing expired" : "Listing withdrawn",
      detail: `Tried to sell${
        listing.list_price_cents
          ? ` at $${Math.round(listing.list_price_cents / 100).toLocaleString()}`
          : ""
      } and came off market. Highest-intent conversation you can have today.`,
      weight: w,
      tone: "hot",
    });
  }

  const tenure = input.tenureYears;
  if (tenure != null) {
    let w = 0;
    if (tenure >= 12) w = 22;
    else if (tenure >= 8) w = 16;
    else if (tenure >= 6) w = 10;
    else if (tenure >= 4) w = 5;
    if (w > 0) {
      score += w;
      signals.push({
        kind: "tenure",
        label: `${Math.round(tenure)} yrs in home`,
        detail:
          tenure >= 8
            ? "Past the typical 7–9 year move window for this market."
            : "Approaching the typical move window.",
        weight: w,
        tone: tenure >= 8 ? "warm" : "info",
      });
    }
  }

  const eq = input.equityPct;
  if (eq != null) {
    let w = 0;
    if (eq >= 0.6) w = 22;
    else if (eq >= 0.45) w = 16;
    else if (eq >= 0.3) w = 9;
    if (w > 0) {
      score += w;
      signals.push({
        kind: "equity",
        label: `${Math.round(eq * 100)}% equity`,
        detail: input.equityDollars
          ? `About $${Math.round(input.equityDollars).toLocaleString()} of move-up down payment sitting in the house.`
          : "Enough equity to fund a move-up purchase.",
        weight: w,
        tone: eq >= 0.45 ? "warm" : "info",
      });
    }
  }

  const permitYears = yearsSince(input.lastPermitDate);
  if (permitYears != null && permitYears <= 2 && (input.permitTotalValue ?? 0) >= 15000) {
    const w = 12;
    score += w;
    signals.push({
      kind: "renovation",
      label: "Recent major permit",
      detail: `$${Math.round(input.permitTotalValue ?? 0).toLocaleString()} of permitted work in the last ${Math.max(
        1,
        Math.round(permitYears),
      )} yr — value story for a CMA, and a reason to call.`,
      weight: w,
      tone: "warm",
    });
  }

  if ((input.taxChangePct ?? 0) >= 8) {
    const w = 8;
    score += w;
    signals.push({
      kind: "tax_pressure",
      label: `Taxes up ${input.taxChangePct}%`,
      detail: "Assessment jump — a common trigger for downsizing or appeal conversations.",
      weight: w,
      tone: "info",
    });
  }

  if (input.ownerOccupied === false) {
    const w = 10;
    score += w;
    signals.push({
      kind: "absentee",
      label: "Absentee owner",
      detail: "Mailing address differs from the property — likely a rental or second home.",
      weight: w,
      tone: "warm",
    });
  }

  if (input.beds != null && input.livingSqft != null && input.beds <= 3 && input.livingSqft < 1500 && (tenure ?? 0) >= 6) {
    const w = 6;
    score += w;
    signals.push({
      kind: "outgrown",
      label: "Likely outgrown",
      detail: `${input.beds} bd / ${input.livingSqft.toLocaleString()} sqft after ${Math.round(
        tenure ?? 0,
      )} years.`,
      weight: w,
      tone: "info",
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band: MoveScore["band"] =
    score >= 60 ? "hot" : score >= 38 ? "warm" : score >= 18 ? "nurture" : "hold";

  const top = [...signals].sort((a, b) => b.weight - a.weight)[0];
  const headline = top ? top.label : "No movement signals yet";

  return { score, band, signals, headline };
}

/** Deterministic, no-AI opening line so the dashboard is useful offline. */
export function draftOpener(name: string | null, score: MoveScore): string {
  const first = (name ?? "there").split(" ")[0];
  switch (score.signals[0]?.kind) {
    case "listed_elsewhere":
      return `No outreach — ${first}'s home is represented. Keep sending value-only updates.`;
    case "expired_listing":
      return `Hi ${first} — I pulled the public record on your home and put together a short read on why it may not have sold, plus what the last 90 days of sales nearby suggest about pricing. Want me to send it over?`;
    case "renovation":
      return `Hi ${first} — I noticed the permitted work on your place. Most owners underprice that in a valuation. I ran an updated number for you.`;
    case "equity":
      return `Hi ${first} — your equity position has moved a lot. I mapped what it would buy in a move-up right now. Interested in the one-pager?`;
    case "tenure":
      return `Hi ${first} — you've been in the home a while and the block has repriced. Here's what your neighbors actually closed at.`;
    default:
      return `Hi ${first} — here's your quarterly home value update with what sold nearby.`;
  }
}
