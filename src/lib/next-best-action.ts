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

/**
 * Temperature is supporting metadata, never the loudest thing on a card.
 * `tone` maps to the semantic system: opportunity (brand orange) for a live
 * relationship moment, attention (amber) for this week, nurture (neutral
 * blue-gray) for steady contact. `dot` is a small marker class, `text` the
 * label colour — no filled pills, no traffic-light red/green.
 */
export const TEMPERATURE_META: Record<
  Temperature,
  {
    label: string;
    hint: string;
    emoji: string;
    tone: "opportunity" | "attention" | "nurture";
    dot: string;
    text: string;
  }
> = {
  hot: {
    label: "Hot",
    hint: "Contact today",
    emoji: "",
    tone: "opportunity",
    dot: "bg-sucasa-orange",
    text: "text-status-opportunity",
  },
  warm: {
    label: "Warm",
    hint: "Contact this week",
    emoji: "",
    tone: "attention",
    dot: "bg-status-attention",
    text: "text-status-attention",
  },
  nurture: {
    label: "Nurture",
    hint: "Stay in the relationship",
    emoji: "",
    tone: "nurture",
    dot: "bg-status-nurture/60",
    text: "text-status-nurture",
  },
};

/** Statuses a person picks by hand after a touch. */
export const OUTCOME_STAGES = [
  "no_answer",
  "talked",
  "appointment",
  "application",
  "closed",
  "not_interested",
] as const;

/** Statuses recorded automatically the moment a touch happens. */
export const AUTO_OUTCOME_STAGES = ["attempted", "emailed"] as const;

export const ALL_OUTCOME_STAGES = [...AUTO_OUTCOME_STAGES, ...OUTCOME_STAGES] as const;
export type OutcomeStage = (typeof ALL_OUTCOME_STAGES)[number];
export type ManualOutcomeStage = (typeof OUTCOME_STAGES)[number];

export function outcomeLabel(stage: OutcomeStage, audience: Audience): string {
  switch (stage) {
    case "attempted":
      return "Reached out";
    case "emailed":
      return "Email sent";
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
  free_and_clear: {
    key: "agent_free_clear",
    channel: "call",
    headline: "Call about their plans for the home",
    ask: "No loan on record — ask what they want the home to do for them next.",
  },
  recent_purchase: {
    key: "agent_new_owner",
    channel: "email",
    headline: "Welcome the new owner",
    ask: "A recent purchase is the best moment to start the relationship.",
  },
  mortgage_age: {
    key: "agent_loan_age",
    channel: "email",
    headline: "Send a financing check-in",
    ask: "The loan has been in place a while — a review is a warm reason to reconnect.",
  },
  permit_activity: {
    key: "agent_permit",
    channel: "text",
    headline: "Ask about the project",
    ask: "Permit records show work underway — offer a trusted pro or a value update.",
  },
  distress: {
    key: "agent_sensitive",
    channel: "call",
    headline: "Reach out personally",
    ask: "Handle with care: ask how you can help, never assume the situation.",
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
  free_and_clear: {
    key: "mlo_free_clear",
    channel: "call",
    headline: "Call about options with no loan in place",
    ask: "No open loan on record — introduce what their equity could do.",
  },
  recent_purchase: {
    key: "mlo_new_owner",
    channel: "email",
    headline: "Introduce yourself to the new owner",
    ask: "Be the lender they already know before they need one.",
  },
  mortgage_age: {
    key: "mlo_loan_age",
    channel: "email",
    headline: "Offer a financing review",
    ask: "Loan seasoning makes a no-pressure review an easy yes.",
  },
  permit_activity: {
    key: "mlo_permit",
    channel: "email",
    headline: "Send a renovation financing overview",
    ask: "Recent permits suggest a project that may need funding.",
  },
  distress: {
    key: "mlo_sensitive",
    channel: "call",
    headline: "Reach out personally",
    ask: "Handle with care: offer help, never assume the homeowner's situation.",
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
