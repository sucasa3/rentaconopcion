/**
 * Agent relationship reveal.
 *
 * This is a *presentation* layer over the canonical agent portfolio output
 * (`getAgentPortfolio`). It does not score anything: every field it reads is
 * already computed by the canonical agent engine (move score / band,
 * engagement, listing status, recommendations, tenure, canonical facts).
 *
 * Differences from the lender Discovery on purpose:
 *  - Agent groups are relationship/property groups. No refinance, HELOC,
 *    loan-balance or qualification plays ever appear here.
 *  - Nothing is locked. The agent's first 100 Home Profiles are permanently
 *    free, so every opportunity found inside them is shown in full.
 */

export const AGENT_FREE_PROFILES = 100;

export const AGENT_REVEAL_GROUPS = [
  "move_signals",
  "engagement",
  "property_change",
  "lifecycle",
  "follow_up",
] as const;

export type AgentRevealGroup = (typeof AGENT_REVEAL_GROUPS)[number];

export const AGENT_GROUP_LABEL: Record<AgentRevealGroup, string> = {
  move_signals: "May be thinking about a move",
  engagement: "Active on their home right now",
  property_change: "Something changed at the property",
  lifecycle: "Anniversary or long tenure",
  follow_up: "A useful reason to reach out",
};

export const AGENT_GROUP_BLURB: Record<AgentRevealGroup, string> = {
  move_signals:
    "Property-record and behavior signals worth a closer look. Signals are reasons to reconnect, not predictions.",
  engagement: "They've been looking at their own home information lately.",
  property_change: "A permit, a tax change or a listing change shows up on the record.",
  lifecycle: "A purchase anniversary this month, or many years in the same home.",
  follow_up: "Home care due on the record gives you something genuinely useful to say.",
};

/** The canonical client shape this view reads. All fields come from the agent engine. */
export interface AgentRevealClient {
  id: string;
  name?: string | null;
  address?: string | null;
  band?: string | null;
  move_score?: number | null;
  engagement_score?: number | null;
  has_behavior?: boolean | null;
  tenure_years?: number | null;
  last_sale_date?: string | null;
  tax_change_pct?: number | null;
  last_permit_date?: string | null;
  listing?: { status?: string | null } | null;
  recommendation_count?: number | null;
  has_intel?: boolean | null;
  estimated_value?: number | null;
}

const MOVE_BANDS = new Set(["high", "hot"]);
const CHANGED_LISTING = new Set(["expired", "withdrawn"]);

/** Purchase anniversary falling in the current calendar month. */
export function anniversaryThisMonth(
  lastSaleDate: string | null | undefined,
  now = new Date(),
): boolean {
  if (!lastSaleDate) return false;
  const sold = new Date(lastSaleDate);
  if (Number.isNaN(sold.getTime())) return false;
  if (sold.getUTCFullYear() >= now.getUTCFullYear()) return false;
  return sold.getUTCMonth() === now.getUTCMonth();
}

function permitWithinMonths(date: string | null | undefined, months: number, now = new Date()) {
  if (!date) return false;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= months * 30 * 24 * 3600 * 1000;
}

/**
 * One primary group per relationship, strongest evidence first, so the counts
 * add up to the headline instead of double-counting people.
 */
export function primaryGroupOf(
  c: AgentRevealClient,
  now = new Date(),
): AgentRevealGroup | null {
  const band = String(c.band ?? "");
  const listingChanged = CHANGED_LISTING.has(String(c.listing?.status ?? ""));
  if (MOVE_BANDS.has(band) || listingChanged) return "move_signals";
  if (c.has_behavior && (c.engagement_score ?? 0) > 0) return "engagement";
  if (
    Math.abs(c.tax_change_pct ?? 0) >= 5 ||
    permitWithinMonths(c.last_permit_date, 18, now)
  ) {
    return "property_change";
  }
  if (anniversaryThisMonth(c.last_sale_date, now) || (c.tenure_years ?? 0) >= 7) {
    return "lifecycle";
  }
  if ((c.recommendation_count ?? 0) > 0) return "follow_up";
  return null;
}

export interface AgentRevealItem {
  clientId: string;
  name: string | null;
  address: string | null;
  group: AgentRevealGroup;
  score: number;
}

export interface AgentRevealSummary {
  analyzed: number;
  opportunities: number;
  quiet: number;
  awaitingRecords: number;
  byGroup: Record<AgentRevealGroup, number>;
}

/** Rank inside the reveal uses the canonical move score only — no new scoring. */
export function buildAgentReveal(
  clients: AgentRevealClient[],
  now = new Date(),
): { items: AgentRevealItem[]; summary: AgentRevealSummary } {
  const byGroup = Object.fromEntries(
    AGENT_REVEAL_GROUPS.map((g) => [g, 0]),
  ) as Record<AgentRevealGroup, number>;

  const items: AgentRevealItem[] = [];
  for (const c of clients) {
    const group = primaryGroupOf(c, now);
    if (!group) continue;
    byGroup[group] += 1;
    items.push({
      clientId: c.id,
      name: c.name ?? null,
      address: c.address ?? null,
      group,
      score: c.move_score ?? 0,
    });
  }
  items.sort((a, b) => b.score - a.score || a.clientId.localeCompare(b.clientId));

  return {
    items,
    summary: {
      analyzed: clients.length,
      opportunities: items.length,
      quiet: clients.length - items.length,
      awaitingRecords: clients.filter((c) => !c.has_intel).length,
      byGroup,
    },
  };
}

export function agentRevealHeadline(summary: AgentRevealSummary): string {
  if (!summary.analyzed) return "Import your past clients to begin";
  if (!summary.opportunities) {
    return `We analyzed ${summary.analyzed} of your past clients`;
  }
  return `${summary.opportunities} relationship${summary.opportunities === 1 ? "" : "s"} may deserve a closer look`;
}

export function agentRevealSupporting(summary: AgentRevealSummary): string {
  if (!summary.analyzed) return "";
  if (!summary.opportunities) {
    return summary.awaitingRecords
      ? `Nothing stands out today. ${summary.awaitingRecords} homes are still waiting on property records.`
      : "Nothing stands out today. We'll tell you the moment something does.";
  }
  const parts = [`Out of the ${summary.analyzed} we analyzed`];
  if (summary.quiet) parts.push(`${summary.quiet} are quiet for now`);
  if (summary.awaitingRecords) {
    parts.push(`${summary.awaitingRecords} are still waiting on property records`);
  }
  return `${parts.join(" · ")}. All of them stay in your free workspace.`;
}
