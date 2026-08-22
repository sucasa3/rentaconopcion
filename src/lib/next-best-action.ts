/**
 * Next Best Action — client-safe vocabulary and ranking.
 *
 * Every open opportunity resolves to exactly ONE recommended action for the
 * professional looking at it. Agents and lenders get different plays on the
 * same homeowner because they earn money from different outcomes.
 *
 * Compliance framing (same rule as opportunities.ts): an action is a suggested
 * *conversation*, never a statement that a homeowner qualifies for, needs, or
 * is eligible for anything.
 */

import type { OpportunityCategory } from "./opportunities";

export type Audience = "agent" | "lender";
export type Channel = "call" | "text" | "email";
export type Temperature = "hot" | "warm" | "nurture";

export const TEMPERATURE_META: Record<
  Temperature,
  { label: string; hint: string; emoji: string; tone: "attention" | "growth" | "info" }
> = {
  hot: { label: "Hot", hint: "Contact today", emoji: "🔥", tone: "attention" },
  warm: { label: "Warm", hint: "Contact this week", emoji: "🟡", tone: "growth" },
  nurture: { label: "Nurture", hint: "Stay in the relationship", emoji: "🔵", tone: "info" },
};

export const OUTCOME_STAGES = [
  "no_answer",
  "talked",
  "appointment",
  "application",
  "closed",
  "not_interested",
] as const;
export type OutcomeStage = (typeof OUTCOME_STAGES)[number];

export function outcomeLabel(stage: OutcomeStage, audience: Audience): string {
  switch (stage) {
    case "no_answer":
      return "No answer";
    case "talked":
      return "Talked";
    case "appointment":
      return audience === "agent" ? "Listing appointment" : "Appointment set";
    case "application":
      return audience === "agent" ? "Listing signed" : "Application started";
    case "closed":
      return audience === "agent" ? "Transaction closed" : "Loan funded";
    case "not_interested":
      return "Not interested";
  }
}

/** Stages that end the follow-up cadence. */
export const TERMINAL_STAGES: OutcomeStage[] = ["closed", "not_interested"];

export interface ActionRecipe {
  key: string;
  channel: Channel;
  /** Short imperative shown on the button and the card. */
  headline: string;
  /** One line telling the professional what the conversation is about. */
  ask: string;
}

const AGENT_RECIPES: Record<OpportunityCategory, ActionRecipe> = {
  equity: {
    key: "agent_equity_update",
    channel: "email",
    headline: "Send a market + equity update",
    ask: "Show what the home is worth now and how much they've built.",
  },
  heloc: {
    key: "agent_improvement",
    channel: "email",
    headline: "Send a home value update",
    ask: "Improvements and equity are a natural reason to reconnect.",
  },
  refinance_review: {
    key: "agent_loop_mlo",
    channel: "text",
    headline: "Check in and loop in your lender",
    ask: "A financing review is a warm reason to restart the relationship.",
  },
  move_up: {
    key: "agent_move_call",
    channel: "call",
    headline: "Call about a possible move",
    ask: "Ask whether they've thought about moving in the next 1–3 years.",
  },
  investment: {
    key: "agent_investor",
    channel: "call",
    headline: "Call about the property plan",
    ask: "Owner may be holding the home as an investment — ask about plans.",
  },
  mortgage_review: {
    key: "agent_touch",
    channel: "email",
    headline: "Send a neighborhood update",
    ask: "Stay top of mind with what's selling around them.",
  },
  home_condition: {
    key: "agent_maintenance",
    channel: "text",
    headline: "Offer a trusted pro",
    ask: "Work is coming due on the home — be the person who solves it.",
  },
  market_timing: {
    key: "agent_seller_call",
    channel: "call",
    headline: "Call now — they're looking",
    ask: "Recent activity suggests they're weighing a move.",
  },
};

const LENDER_RECIPES: Record<OpportunityCategory, ActionRecipe> = {
  equity: {
    key: "mlo_equity_report",
    channel: "email",
    headline: "Send an equity report",
    ask: "Show how much capital they've built and the options it opens.",
  },
  heloc: {
    key: "mlo_heloc",
    channel: "email",
    headline: "Send a line-of-credit overview",
    ask: "Low loan-to-value makes a line of credit worth a conversation.",
  },
  refinance_review: {
    key: "mlo_refi_call",
    channel: "call",
    headline: "Call about a rate review",
    ask: "Their rate sits above today's benchmark — offer to run the numbers.",
  },
  move_up: {
    key: "mlo_purchase",
    channel: "call",
    headline: "Call about purchase financing",
    ask: "Equity could support a move-up down payment.",
  },
  investment: {
    key: "mlo_investor",
    channel: "call",
    headline: "Call about investment financing",
    ask: "Signals suggest interest in an investment property.",
  },
  mortgage_review: {
    key: "mlo_review",
    channel: "email",
    headline: "Send a financing check-in",
    ask: "A general review keeps you in front of them.",
  },
  home_condition: {
    key: "mlo_renovation",
    channel: "email",
    headline: "Send a renovation financing note",
    ask: "Upcoming work on the home can prompt a financing conversation.",
  },
  market_timing: {
    key: "mlo_preapproval",
    channel: "call",
    headline: "Call before they shop",
    ask: "Activity suggests a move is being considered — get in early.",
  },
};

export function recipeFor(category: string, audience: Audience): ActionRecipe {
  const table = audience === "agent" ? AGENT_RECIPES : LENDER_RECIPES;
  return (
    table[category as OpportunityCategory] ?? {
      key: "generic_touch",
      channel: "email",
      headline: "Reach out",
      ask: "A new signal was detected on this home.",
    }
  );
}

export interface RankInput {
  score: number;
  strength: string;
  /** Homeowner opened, clicked, replied, or used the app in the last 14 days. */
  engagedRecently: boolean;
  /** Days since anyone on this team last reached out. null = never. */
  daysSinceContact: number | null;
  /** An outcome has already been logged for this opportunity. */
  worked?: boolean;
}

/** Blended 0–100 priority used to order the daily queue. */
export function rankScore(i: RankInput): number {
  let n = Math.max(0, Math.min(100, i.score));
  if (i.strength === "strong") n += 12;
  else if (i.strength === "moderate") n += 4;
  if (i.engagedRecently) n += 30;
  if (i.daysSinceContact == null) n += 6;
  else if (i.daysSinceContact < 7) n -= 25;
  else if (i.daysSinceContact > 60) n += 8;
  if (i.worked) n -= 15;
  return Math.max(0, Math.round(n));
}

export function temperatureFor(i: RankInput): Temperature {
  if (i.engagedRecently) return "hot";
  const n = rankScore(i);
  if (n >= 75) return "hot";
  if (n >= 50) return "warm";
  return "nurture";
}

/** Plain-language reason line shown under the name. */
export function whyLine(reasons: string[] | null | undefined, fallback: string): string {
  const first = (reasons ?? []).find((r) => r && r.trim());
  return first ?? fallback;
}
