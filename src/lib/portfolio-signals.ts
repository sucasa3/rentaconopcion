/**
 * Bridge: Home Record signals -> business opportunities.
 *
 * Phase 3 prerequisite. The agent and lender surfaces used to run their own
 * loan-only heuristic. They now read the SAME signal engine the homeowner
 * dashboard reads, so a home means one thing everywhere. Signals are mapped
 * into the opportunity vocabulary the boards, campaigns and intros already
 * speak.
 */

import type { HomeRecord } from "@/lib/home-record";
import { evaluateHome, type HomeSignal, type SignalNetwork } from "@/lib/signals";
import type { DerivedOpportunity, OpportunityCategory, OpportunityStrength } from "@/lib/opportunities";

export type SignalBackedOpportunity = DerivedOpportunity & {
  /** Stable signal id this opportunity came from, when signal-derived. */
  signalKey: string | null;
  network: SignalNetwork | null;
  confidence: number | null;
};

function strengthFor(score: number): OpportunityStrength {
  if (score >= 70) return "strong";
  if (score >= 45) return "moderate";
  return "emerging";
}

/** Which opportunity a signal type belongs to. Null = not a business signal. */
function categoryForSignal(s: HomeSignal, record: HomeRecord): OpportunityCategory | null {
  switch (s.type) {
    case "refi_opportunity":
      return "refinance_review";
    case "equity_available": {
      const ltv =
        record.financial.value.value && record.financial.loanBalance
          ? (record.financial.loanBalance / record.financial.value.value) * 100
          : null;
      return ltv != null && ltv <= 65 ? "heloc" : "equity";
    }
    case "value_movement":
      return "move_up";
    case "selling_intent":
    case "engagement_spike":
      return "market_timing";
    case "component_overdue":
    case "component_due_soon":
    case "inspection_findings":
      return "home_condition";
    default:
      return null;
  }
}

/**
 * Run the shared engine over a home record and return opportunities in the
 * business vocabulary. Highest-scoring signal wins per category, and its
 * reason lines carry through verbatim so the board explains itself.
 */
export function opportunitiesFromRecord(record: HomeRecord): SignalBackedOpportunity[] {
  const { signals } = evaluateHome(record);
  const best = new Map<OpportunityCategory, SignalBackedOpportunity>();

  for (const s of signals) {
    const category = categoryForSignal(s, record);
    if (!category) continue;
    const existing = best.get(category);
    if (existing && existing.score >= s.score) {
      if (existing.reasons.length < 3) existing.reasons.push(s.reason);
      continue;
    }
    best.set(category, {
      category,
      strength: strengthFor(s.score),
      score: Math.round(s.score),
      reasons: [s.title, s.reason].filter(Boolean),
      signalKey: s.key,
      network: s.network,
      confidence: s.confidence,
    });
  }

  return [...best.values()].sort((a, b) => b.score - a.score);
}

/**
 * Merge signal-derived opportunities with the loan-fact heuristic, preferring
 * the record-backed one whenever both describe the same category.
 */
export function mergeOpportunities(
  fromRecord: SignalBackedOpportunity[],
  fromLoanFacts: DerivedOpportunity[],
): SignalBackedOpportunity[] {
  const out = new Map<OpportunityCategory, SignalBackedOpportunity>();
  for (const o of fromLoanFacts) {
    out.set(o.category, { ...o, signalKey: null, network: null, confidence: null });
  }
  for (const o of fromRecord) {
    const prev = out.get(o.category);
    out.set(o.category, prev && prev.score > o.score ? { ...o, score: prev.score, strength: prev.strength } : o);
  }
  return [...out.values()].sort((a, b) => b.score - a.score);
}
