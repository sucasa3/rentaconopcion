/**
 * Agent Home Profile capacity — the distribution engine.
 *
 * Pure, client-safe. The same weights drive the copy an agent reads and the
 * awards the server writes, so the two can never drift apart.
 *
 * Capacity comes from SuCasa, or from the agent's own work or purchase:
 *   1. the base entitlement SuCasa provides to every agent account,
 *   2. lender-neutral platform activity the agent does themselves,
 *   3. an Agent continuation plan the agent buys.
 *
 * A lender payment is never a source. Nothing here may reward a loan,
 * referral, closing, transaction, lender activity, or the selection of a
 * title, escrow, inspection, appraisal or insurance provider.
 * See `entitlements.ts` for the rule and the guards.
 */

import { DEFAULT_AGENT_BASE_PROFILES } from "./entitlements";

export type CreditEventKind =
  | "activate"
  | "profile"
  | "engage"
  | "opportunity"
  | "service_request";

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
    detail: "A message, an update you send, or a note on their record.",
  },
  {
    kind: "opportunity",
    credits: 2,
    label: "Opportunity identified",
    detail: "SuCasa spots equity, condition or move-up potential on that home.",
  },
  {
    kind: "service_request",
    credits: 2,
    label: "Home service request",
    detail:
      "The homeowner requests maintenance or improvement work through SuCasa. Never awarded for lender, title, escrow, closing, inspection, appraisal or insurance activity.",
  },
];

/**
 * Removed on purpose — each was tied to a loan, a referral, a transaction or a
 * settlement service provider, so none may award an agent anything.
 */
export const RETIRED_CREDIT_RULES = [
  "lender_engaged",
  "opportunity_progress",
  "referral",
] as const;

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
    name: "SuCasa for Agents",
    priceMonthly: 0,
    credits: DEFAULT_AGENT_BASE_PROFILES,
    headline: "Your first 100 Home Profiles, free from SuCasa",
    features: [
      "100 Home Profiles provided by SuCasa",
      "No lender relationship required",
      "Home Intelligence basics",
      "Opportunity alerts",
      "Earn more capacity from your own work",
    ],
  },
  {
    key: "agent",
    name: "Agent",
    priceMonthly: 49,
    credits: 250,
    headline: "250 Home Profiles",
    features: [
      "250 Home Profiles",
      "Full Home Intelligence reports",
      "Opportunity identification across your book",
      "Document and maintenance intelligence",
      "Keep earning capacity as you work",
    ],
  },
  {
    key: "agent_growth",
    name: "Agent Growth",
    priceMonthly: 99,
    credits: 1000,
    headline: "1,000 Home Profiles",
    features: [
      "1,000 Home Profiles",
      "Full Home Intelligence for every client",
      "Advanced opportunity intelligence",
      "Bulk import and CRM sync",
      "Priority support",
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
