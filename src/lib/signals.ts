/**
 * THE SIGNAL ENGINE — CPU layer of the SuCasa model.
 *
 * One evaluator reads the Home Record and answers "what should happen next?".
 * Every rule lives here (condition, equity, refinance, intent, records), each
 * emitting a typed signal with a strength, a reason, a freshness stamp and the
 * network it belongs to. Dashboards render signals; they don't re-derive them.
 *
 * Adding an opportunity type = adding a rule below, not a new panel.
 */

import type { HomeRecord } from "@/lib/home-record";
import { categorySlugFor, pickNextStep, type NextStep } from "@/lib/next-step";
import { computeHomeScore, type HomeScoreResult } from "@/lib/home-score";

/** Which side of the network acts on a signal (Phase 3 routing declaration). */
export type SignalNetwork = "vendor" | "lender" | "agent" | "insurer" | "homeowner";

export type SignalStrength = "high" | "medium" | "low";

export type SignalType =
  | "component_overdue"
  | "component_due_soon"
  | "inspection_findings"
  | "refi_opportunity"
  | "equity_available"
  | "value_movement"
  | "recent_improvement"
  | "selling_intent"
  | "engagement_spike"
  | "record_gap";

export type HomeSignal = {
  /** Stable id so a signal can be suppressed or tracked over time. */
  key: string;
  type: SignalType;
  network: SignalNetwork;
  strength: SignalStrength;
  /** 0-100 — used for ranking across types. */
  score: number;
  /** 0-1 — how much we trust the inputs behind it. */
  confidence: number;
  title: string;
  /** Plain-language why, always grounded in a record value. */
  reason: string;
  /** Service category this fires into, when applicable. */
  category?: string;
  cta?: { label: string; to: string; search?: Record<string, string>; tab?: "home" | "care" | "documents" };
  freshness: { asOf: string; stale: boolean };
};

export type SignalReport = {
  signals: HomeSignal[];
  /** Highest-value single action, rendered by the next-step hero. */
  nextStep: NextStep;
  score: HomeScoreResult | null;
  byNetwork: Record<SignalNetwork, HomeSignal[]>;
};

const EMPTY_BY_NETWORK = (): Record<SignalNetwork, HomeSignal[]> => ({
  vendor: [],
  lender: [],
  agent: [],
  insurer: [],
  homeowner: [],
});

function strengthFor(score: number): SignalStrength {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/** Run every rule against the record and return a ranked signal set. */
export function evaluateHome(record: HomeRecord): SignalReport {
  const { property, financial, physical, behavior } = record;
  const asOf = record.asOf;
  const stale = (cls: string) => record.staleClasses.includes(cls);
  const out: HomeSignal[] = [];

  // ---- Condition -----------------------------------------------------------
  for (const item of physical.overdue) {
    const yearsOver = Math.abs(Math.round(item.yearsLeft));
    const score = Math.min(96, 72 + yearsOver * 3);
    out.push({
      key: `component_overdue:${item.key}`,
      type: "component_overdue",
      network: "vendor",
      strength: strengthFor(score),
      score,
      confidence: item.source === "logged" ? 0.95 : item.source === "permit" ? 0.8 : 0.5,
      title: `${item.label} is past its expected life`,
      reason:
        item.source === "year_built"
          ? `Estimated from year built ${item.installedYear} — about ${yearsOver} year${yearsOver === 1 ? "" : "s"} beyond a ${item.expectedYear - item.installedYear}-year life.`
          : `Installed ${item.installedYear} (${item.source === "permit" ? "permit record" : "your record"}), ${yearsOver} year${yearsOver === 1 ? "" : "s"} past expected life.`,
      category: item.category,
      cta: {
        label: "Get a quote",
        to: "/request",
        search: { category: categorySlugFor(item.category) },
        tab: "care",
      },
      freshness: { asOf, stale: stale("permits") },
    });
  }

  for (const item of physical.dueSoon) {
    const score = 52;
    out.push({
      key: `component_due_soon:${item.key}`,
      type: "component_due_soon",
      network: "vendor",
      strength: strengthFor(score),
      score,
      confidence: item.source === "logged" ? 0.9 : item.source === "permit" ? 0.75 : 0.45,
      title: `${item.label} is nearing end of life`,
      reason: `Reaches the end of its expected life around ${item.expectedYear}. Pricing it now avoids an emergency later.`,
      category: item.category,
      cta: {
        label: "Plan the work",
        to: "/request",
        search: { category: categorySlugFor(item.category) },
        tab: "care",
      },
      freshness: { asOf, stale: stale("permits") },
    });
  }

  if (physical.openFindings > 0) {
    const high = physical.findings.filter((f) => (f.urgency ?? "").toLowerCase() === "high").length;
    const score = Math.min(94, 60 + high * 10);
    out.push({
      key: "inspection_findings",
      type: "inspection_findings",
      network: "vendor",
      strength: strengthFor(score),
      score,
      confidence: 0.9,
      title: `${physical.openFindings} inspection item${physical.openFindings === 1 ? "" : "s"} to resolve`,
      reason: high > 0 ? `${high} flagged high urgency in your inspection report.` : "Pulled from your inspection report.",
      cta: { label: "Review findings", to: "/dashboard", tab: "documents" },
      freshness: { asOf, stale: false },
    });
  }

  // ---- Financial -----------------------------------------------------------
  if (financial.refiSignal === "strong" || financial.refiSignal === "moderate") {
    const savings = financial.refi?.monthlySavings ?? null;
    const score = financial.refiSignal === "strong" ? 85 : 62;
    out.push({
      key: "refi_opportunity",
      type: "refi_opportunity",
      network: "lender",
      strength: strengthFor(score),
      score,
      confidence: financial.loanBalance != null && financial.rate != null ? 0.75 : 0.5,
      title: savings ? `About ${money(savings)}/mo of headroom on your loan` : "Your rate looks refinanceable",
      reason:
        financial.rate != null
          ? `Current rate around ${financial.rate}% against today's benchmark, on an estimated balance of ${financial.loanBalance ? money(financial.loanBalance) : "record"}.`
          : "Your equity position and current benchmark rates suggest a review is worth it.",
      cta: { label: "See refi options", to: "/dashboard", tab: "home" },
      freshness: { asOf, stale: stale("mortgage") },
    });
  }

  if ((financial.equityPct ?? 0) >= 0.3 && (financial.equityDollars ?? 0) > 50_000) {
    const score = 58;
    out.push({
      key: "equity_available",
      type: "equity_available",
      network: "lender",
      strength: strengthFor(score),
      score,
      confidence: 0.7,
      title: `${money(financial.equityDollars!)} of estimated equity`,
      reason: `About ${Math.round((financial.equityPct ?? 0) * 100)}% of your home's value${
        financial.cashOutHeadroom ? `, with roughly ${money(financial.cashOutHeadroom)} of cash-out headroom` : ""
      }.`,
      cta: { label: "See your options", to: "/dashboard", tab: "home" },
      freshness: { asOf, stale: stale("avm") },
    });
  }

  if (financial.value.value != null && property.lastSalePrice && property.lastSalePrice > 0) {
    const delta = financial.value.value - property.lastSalePrice;
    const pct = delta / property.lastSalePrice;
    if (pct >= 0.1) {
      const score = Math.min(70, 40 + Math.round(pct * 100));
      out.push({
        key: "value_movement",
        type: "value_movement",
        network: "agent",
        strength: strengthFor(score),
        score,
        confidence: 0.7,
        title: `Up about ${Math.round(pct * 100)}% since you bought`,
        reason: `Estimated ${money(financial.value.value)} today against ${money(property.lastSalePrice)}${
          property.lastSaleDate ? ` in ${property.lastSaleDate.slice(0, 4)}` : ""
        }.`,
        cta: { label: "See what it means", to: "/dashboard", tab: "home" },
        freshness: { asOf, stale: stale("avm") },
      });
    }
  }

  // ---- Intent --------------------------------------------------------------
  if (behavior.sellingIntent) {
    out.push({
      key: "selling_intent",
      type: "selling_intent",
      network: "agent",
      strength: "high",
      score: 90,
      confidence: 0.95,
      title: "You told us you're thinking about selling",
      reason: `Timeframe on record: ${behavior.sellingIntent}.`,
      cta: { label: "Plan the move", to: "/dashboard", tab: "home" },
      freshness: { asOf, stale: false },
    });
  }

  const checks = behavior.valueChecks30d + behavior.equityChecks30d;
  if (checks >= 3) {
    const score = Math.min(75, 45 + checks * 5);
    out.push({
      key: "engagement_spike",
      type: "engagement_spike",
      network: "agent",
      strength: strengthFor(score),
      score,
      confidence: 0.6,
      title: "You've been checking your numbers",
      reason: `${checks} value or equity checks in the last 30 days — usually the start of a decision.`,
      cta: { label: "Talk it through", to: "/dashboard", tab: "home" },
      freshness: { asOf, stale: false },
    });
  }

  // ---- Record gaps ---------------------------------------------------------
  for (const section of record.completeness.sections) {
    if (section.pct >= 75 || section.missing.length === 0) continue;
    const score = 30 - Math.round(section.pct / 10);
    out.push({
      key: `record_gap:${section.key}`,
      type: "record_gap",
      network: "homeowner",
      strength: "low",
      score,
      confidence: 1,
      title: `${section.label} record is ${section.pct}% complete`,
      reason: `Missing: ${section.missing.slice(0, 3).join(", ")}.`,
      cta:
        section.key === "physical"
          ? { label: "Add records", to: "/dashboard", tab: "documents" }
          : { label: "Complete your profile", to: "/onboarding" },
      freshness: { asOf, stale: false },
    });
  }

  out.sort((a, b) => b.score - a.score || b.confidence - a.confidence);

  const score =
    physical.timeline.length > 0
      ? computeHomeScore({
          timeline: physical.timeline,
          findings: physical.findings,
          hasDocuments: physical.documentCount > 0,
          hasAddress: !!property.address,
          hasLogs: physical.serviceLogCount > 0,
        })
      : null;

  const nextStep = pickNextStep({
    hasAddress: !!property.address,
    hasDocuments: physical.documentCount > 0,
    hasLogs: physical.serviceLogCount > 0,
    timeline: physical.timeline,
    openFindings: physical.openFindings,
    refiSignal: financial.refiSignal,
    monthlySavings: financial.refi?.monthlySavings ?? null,
    openRequests: behavior.openRequests,
  });

  const byNetwork = EMPTY_BY_NETWORK();
  for (const s of out) byNetwork[s.network].push(s);

  return { signals: out, nextStep, score, byNetwork };
}

export const NETWORK_LABEL: Record<SignalNetwork, string> = {
  vendor: "Home services",
  lender: "Financing",
  agent: "Market and sale",
  insurer: "Insurance",
  homeowner: "Your records",
};
