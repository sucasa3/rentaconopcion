/**
 * Homeowner credits — the distribution engine.
 *
 * Pure, client-safe. The same weights drive the copy an agent reads and the
 * awards the server writes, so the two can never drift apart.
 *
 * Capacity is the currency: every homeowner an agent adds costs one credit.
 * Credits arrive three ways — a base grant, a lender sponsorship, or work the
 * agent does on the platform.
 */

export type CreditEventKind =
  | "activate"
  | "profile"
  | "engage"
  | "opportunity"
  | "lender_engaged"
  | "service_request"
  | "opportunity_progress"
  | "referral";

export interface CreditRule {
  kind: CreditEventKind;
  credits: number;
  label: string;
  detail: string;
}

export const CREDIT_RULES: CreditRule[] = [
  {
    kind: "activate",
    credits: 1,
    label: "Homeowner activates their account",
    detail: "They claim the profile you sent and sign in for the first time.",
  },
  {
    kind: "profile",
    credits: 1,
    label: "Home Profile completed",
    detail: "Address and owner details filled in, so we can build the Home Record.",
  },
  {
    kind: "engage",
    credits: 1,
    label: "You engage the homeowner",
    detail: "An introduction, a campaign send, or a note on their record.",
  },
  {
    kind: "opportunity",
    credits: 2,
    label: "Opportunity identified",
    detail: "SuCasa finds equity, refinance, move-up or service potential on that home.",
  },
  {
    kind: "lender_engaged",
    credits: 2,
    label: "Lender opportunity engaged",
    detail: "A connected lender acts on one of your homeowners, with your approval.",
  },
  {
    kind: "service_request",
    credits: 2,
    label: "Vendor or service request",
    detail: "The homeowner requests work on their home through SuCasa.",
  },
  {
    kind: "opportunity_progress",
    credits: 3,
    label: "Opportunity progresses",
    detail: "An introduction reaches a real outcome.",
  },
  {
    kind: "referral",
    credits: 5,
    label: "Referral or transaction",
    detail: "The relationship turns into business.",
  },
];

export function creditsFor(kind: CreditEventKind): number {
  return CREDIT_RULES.find((r) => r.kind === kind)?.credits ?? 0;
}

export function creditReason(kind: CreditEventKind): string {
  return CREDIT_RULES.find((r) => r.kind === kind)?.label ?? "Activity credit";
}

// --- Plans -----------------------------------------------------------------

export interface AgentPlanDef {
  key: string;
  name: string;
  priceMonthly: number;
  credits: number;
  headline: string;
  features: string[];
}

export const AGENT_PLANS: AgentPlanDef[] = [
  {
    key: "agent_core",
    name: "Agent Core",
    priceMonthly: 0,
    credits: 25,
    headline: "25 homeowners to start, plus everything you earn",
    features: [
      "25 homeowner connections",
      "Home Intelligence basics",
      "Opportunity alerts",
      "Lender and vendor connections",
      "Earn more credits as you work",
    ],
  },
  {
    key: "agent_plus",
    name: "Agent Plus",
    priceMonthly: 20,
    credits: 100,
    headline: "Unlock 100 more homeowners",
    features: [
      "+100 homeowner connections",
      "Premium Home Intelligence reports",
      "Opportunity identification across your book",
      "Included in the SuCasa referral network",
      "Keep earning credits as you work",
    ],
  },
  {
    key: "agent_pro",
    name: "Agent Pro",
    priceMonthly: 39,
    credits: 250,
    headline: "Unlock 250 more homeowners",
    features: [
      "+250 homeowner connections",
      "Premium reports for every client",
      "Advanced opportunity intelligence",
      "Priority referral opportunities",
      "Enhanced lender and vendor matching",
    ],
  },
];

export function planByKey(key: string | null | undefined): AgentPlanDef {
  return AGENT_PLANS.find((p) => p.key === key) ?? AGENT_PLANS[0]!;
}

// --- SuCasa Score ----------------------------------------------------------

export interface ScoreInput {
  clients: number;
  activated: number;
  profilesComplete: number;
  opportunities: number;
  engagedLast30d: number;
}

export interface SuCasaScore {
  score: number;
  parts: { label: string; value: number; max: number }[];
  headline: string;
}

/**
 * A single honest number for how well an agent is working their book.
 * Deliberately forgiving on volume and strict on activation, because
 * activation is what actually makes the intelligence work.
 */
export function computeSuCasaScore(input: ScoreInput): SuCasaScore {
  const denom = Math.max(1, input.clients);
  const activation = Math.min(1, input.activated / denom) * 40;
  const completeness = Math.min(1, input.profilesComplete / denom) * 20;
  const opportunity = Math.min(1, input.opportunities / denom) * 20;
  const recency = Math.min(1, input.engagedLast30d / Math.max(1, Math.min(denom, 20))) * 20;

  const score = Math.round(activation + completeness + opportunity + recency);

  const headline =
    score >= 75
      ? "Your book is working hard for you."
      : score >= 45
        ? "Good momentum — activating more homeowners is the fastest lift."
        : "Invite a few homeowners to activate and your score climbs quickly.";

  return {
    score: Math.max(0, Math.min(100, score)),
    parts: [
      { label: "Homeowners activated", value: Math.round(activation), max: 40 },
      { label: "Profiles completed", value: Math.round(completeness), max: 20 },
      { label: "Opportunities identified", value: Math.round(opportunity), max: 20 },
      { label: "Recent engagement", value: Math.round(recency), max: 20 },
    ],
    headline,
  };
}
