/**
 * ONE PRIMARY STORY, told correctly for the role.
 *
 * Detection, stored categories, ranking, permissions and access gating all
 * happen elsewhere and are untouched. This module only decides, from the
 * canonical fact snapshot plus the already-detected categories:
 *
 *   - which single opportunity leads
 *   - why now, why it matters, how to be useful
 *   - the call to action
 *   - supporting signals and (separately) secondary signals
 *   - an opener seed the LLM may paraphrase
 *
 * Pure and deterministic. No LLM, no I/O, no recomputation of facts.
 * Agents get relationship and property plays; financing detections become a
 * relationship conversation for them, never a product recommendation.
 * Lenders keep financing-primary narratives.
 */

import { money, pct, roughMoney, type ClientFacts } from "@/lib/client-facts";

export type NarrativeRole = "agent" | "lender";

export interface NarrativeInput {
  role: NarrativeRole;
  facts: ClientFacts;
  /** Raw stored opportunity categories — never renamed or migrated. */
  categories: string[];
  firstName?: string | null;
  /** The homeowner explicitly asked for help. */
  homeownerRequested?: boolean;
  /** What they asked about, when known. */
  requestTopic?: "financing" | "selling" | "home_value" | "other" | null;
  engagementLine?: string | null;
}

export interface Narrative {
  /** Internal play key — presentation only, stored categories are unchanged. */
  play: string;
  headline: string;
  whyNow: string;
  whyItMatters: string;
  howToBeUseful: string;
  cta: string;
  supportingSignals: string[];
  secondarySignals: string[];
  openerSeed: string;
  complianceNote: string | null;
}

const FINANCING = new Set([
  "heloc",
  "refinance_review",
  "mortgage_age",
  "mortgage_review",
  "equity",
  "free_and_clear",
  "equity_review",
  "home_equity_conversation",
  "equity_milestone",
]);

const cat = (categories: string[], ...names: string[]) =>
  names.some((n) => categories.includes(n));

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

function supporting(f: ClientFacts): string[] {
  const out: string[] = [];
  if (f.tenureYears != null && f.tenureYears >= 1)
    out.push(`${Math.round(f.tenureYears * 10) / 10} years owned`);
  if (f.sqft) out.push(`${f.sqft.toLocaleString()} sq ft`);
  if (f.beds) out.push(`${f.beds} ${f.beds === 1 ? "bedroom" : "bedrooms"}`);
  if (f.value) out.push(`${money(f.value)} estimated value`);
  if (f.equityPct != null && f.equityActionable)
    out.push(`~${pct(f.equityPct * 100)} estimated equity`);
  if (f.permitCount) out.push(`${f.permitCount} recorded permit${f.permitCount === 1 ? "" : "s"}`);
  return out.slice(0, 5);
}

function equityPhrase(f: ClientFacts): string | null {
  if (!f.equityActionable) return null;
  if (f.equityDollars != null) return `${money(f.equityDollars)} estimated equity`;
  if (f.equityPct != null) return `~${pct(f.equityPct * 100)} estimated equity`;
  return null;
}

// ---------------------------------------------------------------------------
// Play selection — one decision, hierarchical
// ---------------------------------------------------------------------------

function agentPlay(input: NarrativeInput): string {
  const { categories: c, facts: f, homeownerRequested, requestTopic } = input;
  if (homeownerRequested) return requestTopic === "financing" ? "requested_financing" : "requested";
  if (cat(c, "move_up", "downsize")) return "move_up";
  if (cat(c, "listing_ready", "market_activity", "value_change")) return "market_update";
  if (cat(c, "maintenance", "home_care", "inspection")) return "home_care";
  if (cat(c, "permits")) return "improvements";
  if (cat(c, "recent_purchase")) return "new_homeowner";
  // Financing detections become a relationship play for agents.
  if (c.some((x) => FINANCING.has(x))) {
    const smallAndLong =
      (f.tenureYears ?? 0) >= 7 && ((f.beds ?? 9) <= 2 || (f.sqft ?? 99_999) <= 1_100);
    return smallAndLong ? "move_up" : "home_value_update";
  }
  if (cat(c, "anniversary", "milestone")) return "milestone";
  return "check_in";
}

function lenderPlay(input: NarrativeInput): string {
  const { categories: c, homeownerRequested, requestTopic } = input;
  if (homeownerRequested) return requestTopic === "selling" ? "purchase_financing" : "requested";
  if (cat(c, "heloc", "home_equity_conversation")) return "heloc_review";
  if (cat(c, "refinance_review", "refinance")) return "refinance";
  if (cat(c, "equity", "equity_review", "equity_milestone", "free_and_clear")) return "equity_review";
  if (cat(c, "mortgage_age", "mortgage_review")) return "mortgage_review";
  if (cat(c, "move_up", "recent_purchase")) return "purchase_financing";
  return "annual_review";
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

function agentNarrative(play: string, input: NarrativeInput): Narrative {
  const f = input.facts;
  const name = input.firstName?.trim() || "there";
  const eq = equityPhrase(f);
  const tenure = f.tenureYears != null ? `${Math.round(f.tenureYears)} years` : null;
  const size =
    f.beds && f.sqft
      ? `a ${f.beds}-bedroom, ${f.sqft.toLocaleString()} sq ft home`
      : f.beds
        ? `a ${f.beds}-bedroom home`
        : f.sqft
          ? `a ${f.sqft.toLocaleString()} sq ft home`
          : "this home";

  const base = {
    supportingSignals: supporting(f),
    secondarySignals: [] as string[],
    complianceNote: null as string | null,
  };

  switch (play) {
    case "requested":
    case "requested_financing":
      return {
        ...base,
        play,
        headline: "Homeowner asked for help",
        whyNow: `${name} reached out through SuCasa.`,
        whyItMatters: "A homeowner-initiated question is the strongest reason to respond today.",
        howToBeUseful: "Answer what they asked, then offer a current home-value update.",
        cta: "Respond today",
        secondarySignals:
          play === "requested_financing"
            ? ["Financing came up — a licensed mortgage professional can take that part."]
            : [],
        openerSeed: `Thanks for reaching out — happy to help. I can pull together where your home stands today and what your options look like.`,
        complianceNote:
          play === "requested_financing"
            ? "Financing questions belong with a licensed mortgage professional."
            : null,
      };

    case "move_up":
      return {
        ...base,
        play,
        headline: "Possible move-up / future-plans conversation",
        whyNow: tenure
          ? `${tenure} in ${size}.`
          : `Long ownership in ${size}.`,
        whyItMatters:
          "Long ownership, a smaller property, and meaningful estimated equity make this a natural time for a home-value and future-plans conversation.",
        howToBeUseful:
          "Offer a home-value update and ask whether the home still fits their plans.",
        cta: "Offer a home-value update",
        secondarySignals: eq ? [`Financial signal — ${eq}.`] : [],
        openerSeed: `Hi ${name} — I was reviewing the market around your home and realized you've been there ${tenure ?? "quite a while"}. You've built meaningful equity, and I thought you might be curious what the home could be worth today and what that could mean for your options. Want me to put together a quick update?`,
      };

    case "home_value_update":
      return {
        ...base,
        play,
        headline: "Home-value & future-plans conversation",
        whyNow: tenure ? `${tenure} of ownership with no recent value update.` : "No recent home-value update on file.",
        whyItMatters:
          "Homeowners rarely know where they stand today. A current value picture is genuinely useful and opens a wider conversation.",
        howToBeUseful: "Share a current value update and ask what they are planning next.",
        cta: "Send a home-value update",
        secondarySignals: eq ? [`Financial signal — ${eq}. If financing comes up, involve a licensed mortgage professional.`] : [],
        openerSeed: `Hi ${name} — I pulled a fresh look at your home's value. You may have more options than you realize. Want me to send it over?`,
      };

    case "market_update":
      return {
        ...base,
        play,
        headline: "Neighborhood market update",
        whyNow: "Recent activity around this property is worth sharing.",
        whyItMatters: "Local activity is the easiest useful reason to reconnect.",
        howToBeUseful: "Share what has been happening nearby and what it means for their home.",
        cta: "Share a market update",
        secondarySignals: eq ? [`Financial signal — ${eq}.`] : [],
        openerSeed: `Hi ${name} — a few things have moved in your neighborhood lately. Want me to send you what it means for your home?`,
      };

    case "home_care":
      return {
        ...base,
        play,
        headline: "Home care & condition conversation",
        whyNow: "A maintenance recommendation is coming due.",
        whyItMatters: "Helping protect the home builds the relationship long before any move.",
        howToBeUseful: "Offer a trusted referral or a quick walkthrough of what is due.",
        cta: "Offer help with upkeep",
        openerSeed: `Hi ${name} — a couple of seasonal items are coming due on your home. Want me to point you to someone good?`,
      };

    case "improvements":
      return {
        ...base,
        play,
        headline: "Recent improvements — worth noting",
        whyNow: f.lastPermitDate ? `Permit activity recorded ${f.lastPermitDate}.` : "Recorded permit activity on the property.",
        whyItMatters: "Work done on the home can change its position and is a natural thing to ask about.",
        howToBeUseful: "Ask about the project and update your record of the home.",
        cta: "Ask about the project",
        openerSeed: `Hi ${name} — I noticed some work recorded on your home. How did the project turn out?`,
      };

    case "new_homeowner":
      return {
        ...base,
        play,
        headline: "New-homeowner check-in",
        whyNow: "Recently purchased.",
        whyItMatters: "The first year is when a homeowner most needs help and remembers who provided it.",
        howToBeUseful: "Check in and share the first-year essentials for the home.",
        cta: "Check in",
        openerSeed: `Hi ${name} — how is the new place treating you? I put together a short first-year checklist if it would help.`,
      };

    case "milestone":
      return {
        ...base,
        play,
        headline: "Ownership milestone",
        whyNow: tenure ? `${tenure} in the home.` : "An ownership milestone is coming up.",
        whyItMatters: "A milestone is a warm, non-transactional reason to reconnect.",
        howToBeUseful: "Acknowledge the milestone and offer a home-value update.",
        cta: "Send a milestone note",
        secondarySignals: eq ? [`Financial signal — ${eq}.`] : [],
        openerSeed: `Hi ${name} — hard to believe it's been ${tenure ?? "a while"} in the home. Want a quick update on where its value stands?`,
      };

    default:
      return {
        ...base,
        play: "check_in",
        headline: "Homeowner check-in",
        whyNow: "It has been a while since the last conversation.",
        whyItMatters: "Staying present is what keeps you the person they call first.",
        howToBeUseful: "Check in and offer something useful about the home.",
        cta: "Check in",
        secondarySignals: eq ? [`Financial signal — ${eq}.`] : [],
        openerSeed: `Hi ${name} — just checking in on the home. Anything you're thinking about this year?`,
      };
  }
}

function lenderNarrative(play: string, input: NarrativeInput): Narrative {
  const f = input.facts;
  const name = input.firstName?.trim() || "there";
  const eq = equityPhrase(f);
  const ltv = f.ltvPct != null ? `${f.ltvPct}% estimated LTV` : null;
  const rate = f.ratePct != null ? `${f.ratePct}% recorded rate` : null;
  const note = "Informational only — any option is subject to qualification.";
  const base = {
    supportingSignals: supporting(f),
    secondarySignals: [] as string[],
    complianceNote: note,
  };

  switch (play) {
    case "requested":
      return {
        ...base,
        play,
        headline: "Homeowner asked for help",
        whyNow: `${name} asked to connect through SuCasa.`,
        whyItMatters: "A homeowner-initiated request is the clearest reason to respond today.",
        howToBeUseful: "Answer their question and offer a mortgage review.",
        cta: "Respond today",
        openerSeed: `Thanks for reaching out — happy to walk through your options and what would need to be reviewed.`,
      };
    case "heloc_review":
      return {
        ...base,
        play,
        headline: "Equity / HELOC review",
        whyNow: [ltv, eq].filter(Boolean).join(" · ") || "Estimated equity position worth a review.",
        whyItMatters:
          "The estimated equity position may support a home equity or cash-out conversation, subject to qualification.",
        howToBeUseful: "Offer an informational review of the equity options available.",
        cta: "Offer an equity review",
        secondarySignals: [rate].filter(Boolean) as string[],
        openerSeed: `Hi ${name} — based on public records your home's estimated value and balance suggest it may be worth reviewing your equity options. Nothing is approved or guaranteed; happy to walk through what a review would involve.`,
      };
    case "refinance":
      return {
        ...base,
        play,
        headline: "Refinance conversation",
        whyNow: rate ? `${rate} on record.` : "Rate context is worth a review.",
        whyItMatters: "Current rate context may make a refinance review worthwhile, subject to qualification.",
        howToBeUseful: "Offer an informational rate and payment review.",
        cta: "Offer a rate review",
        secondarySignals: [eq].filter(Boolean) as string[],
        openerSeed: `Hi ${name} — your recorded rate and current market context suggest a refinance review could be worth a look. Subject to qualification, of course.`,
      };
    case "equity_review":
      return {
        ...base,
        play,
        headline: "Equity review",
        whyNow: eq ?? "Estimated equity position worth a review.",
        whyItMatters: "A meaningful estimated equity position may open financing options, subject to qualification.",
        howToBeUseful: "Offer an informational equity review.",
        cta: "Offer an equity review",
        secondarySignals: [ltv].filter(Boolean) as string[],
        openerSeed: `Hi ${name} — public records suggest you've built meaningful estimated equity. Happy to walk through what that could mean, subject to qualification.`,
      };
    case "mortgage_review":
      return {
        ...base,
        play,
        headline: "Annual mortgage review",
        whyNow: f.tenureYears != null ? `${Math.round(f.tenureYears)} years since the loan closed.` : "The loan is aging.",
        whyItMatters: "An annual review keeps the borrower informed about their financing position.",
        howToBeUseful: "Offer a no-obligation annual mortgage review.",
        cta: "Offer a mortgage review",
        secondarySignals: [eq, rate].filter(Boolean) as string[],
        openerSeed: `Hi ${name} — it's been a while since your loan closed. Want me to run a quick annual review of where your mortgage stands?`,
      };
    case "purchase_financing":
      return {
        ...base,
        play,
        headline: "Purchase financing conversation",
        whyNow: "Signals suggest a future move may be on the table.",
        whyItMatters: "If a move happens, financing planning early is genuinely useful, subject to qualification.",
        howToBeUseful: "Offer to review what a next purchase could look like.",
        cta: "Offer a financing conversation",
        secondarySignals: [eq].filter(Boolean) as string[],
        openerSeed: `Hi ${name} — if a move is ever on your mind, I can walk you through what financing the next home could look like. Nothing formal, just information.`,
      };
    default:
      return {
        ...base,
        play: "annual_review",
        headline: "Annual financing review",
        whyNow: "No recent financing review on file.",
        whyItMatters: "A yearly check-in keeps the relationship warm and the borrower informed.",
        howToBeUseful: "Offer a short, informational review.",
        cta: "Offer a review",
        secondarySignals: [eq, rate].filter(Boolean) as string[],
        openerSeed: `Hi ${name} — checking in for your annual mortgage review. Want me to put one together?`,
      };
  }
}

/** Decide the one story this surface should tell. Pure and deterministic. */
export function buildNarrative(input: NarrativeInput): Narrative {
  const play = input.role === "agent" ? agentPlay(input) : lenderPlay(input);
  const n = input.role === "agent" ? agentNarrative(play, input) : lenderNarrative(play, input);
  if (input.engagementLine) {
    return { ...n, supportingSignals: [...n.supportingSignals, input.engagementLine].slice(0, 6) };
  }
  return n;
}

/** Facts an LLM is allowed to see, already formatted. Never raw math. */
export function narrativeFactSheet(f: ClientFacts): Record<string, string> {
  const sheet: Record<string, string> = {};
  const add = (k: string, v: string | null) => {
    if (v) sheet[k] = v;
  };
  add("estimated value", money(f.value));
  if (f.equityActionable) {
    add("estimated equity", money(f.equityDollars));
    add("estimated equity share", f.equityPct != null ? pct(f.equityPct * 100) : null);
  }
  add("years owned", f.tenureYears != null ? `${Math.round(f.tenureYears * 10) / 10}` : null);
  add("bedrooms", f.beds != null ? String(f.beds) : null);
  add("bathrooms", f.baths != null ? String(f.baths) : null);
  add("square feet", f.sqft != null ? f.sqft.toLocaleString() : null);
  add("year built", f.yearBuilt != null ? String(f.yearBuilt) : null);
  add("approximate equity", roughMoney(f.equityActionable ? f.equityDollars : null));
  return sheet;
}

// ---------------------------------------------------------------------------
// Copy safety — nothing reaches a professional surface unless it agrees with
// the canonical snapshot and with the role's language rules.
// ---------------------------------------------------------------------------

/** Financing product language an agent must never produce. */
const AGENT_FORBIDDEN: { re: RegExp; code: string }[] = [
  { re: /\bhelocs?\b/i, code: "heloc" },
  { re: /home\s+equity\s+(line|loan)/i, code: "home_equity_product" },
  { re: /\bcash[-\s]?out\b/i, code: "cash_out" },
  { re: /\brefinanc\w*\b/i, code: "refinance" },
  { re: /\brefi\b/i, code: "refinance" },
  { re: /\bltv\b/i, code: "ltv" },
  { re: /loan[-\s]?to[-\s]?value/i, code: "ltv" },
  { re: /\bloan balance\b/i, code: "loan_balance" },
  { re: /\bmortgage rate\b/i, code: "rate" },
  { re: /\bqualif\w*\b/i, code: "qualification" },
];

function allowedNumbers(f: ClientFacts, role: NarrativeRole): number[] {
  const nums: (number | null)[] = [
    f.value,
    f.sqft,
    f.beds,
    f.baths,
    f.yearBuilt,
    f.taxAmount,
    f.assessedTotal,
    f.lastSalePrice,
    f.tenureYears,
    f.tenureYears != null ? Math.round(f.tenureYears) : null,
    f.permitCount,
  ];
  if (f.equityActionable) {
    nums.push(f.equityDollars, f.equityPct != null ? f.equityPct * 100 : null);
  }
  if (role === "lender") {
    nums.push(f.loanBalance, f.ltvPct, f.ratePct);
  }
  return nums.filter((n): n is number => n != null && Number.isFinite(n));
}

const NUM_RE = /\$?\s?([\d][\d,]*(?:\.\d+)?)\s?(k|m|%)?/gi;

/**
 * True when a generated line only states numbers that exist in the canonical
 * snapshot and uses language permitted for the role. Rejected copy is replaced
 * by the deterministic opener seed — never patched word by word.
 */
export function copyAgreesWithFacts(
  text: string | null | undefined,
  facts: ClientFacts,
  role: NarrativeRole,
  opts?: { address?: string | null },
): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  const t = (text ?? "").trim();
  if (!t) return { ok: false, violations: ["empty"] };

  if (role === "agent") {
    for (const rule of AGENT_FORBIDDEN)
      if (rule.re.test(t) && !violations.includes(rule.code)) violations.push(rule.code);
  }

  const allowed = allowedNumbers(facts, role);
  // Street numbers and ZIPs from the property address are not claims.
  const addressNumbers = new Set(
    (opts?.address ?? "").match(/\d[\d,]*/g)?.map((x) => x.replace(/,/g, "")) ?? [],
  );
  const matches = [...t.matchAll(NUM_RE)];
  for (const m of matches) {
    const raw = m[1]!.replace(/,/g, "");
    let n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const suffix = (m[2] ?? "").toLowerCase();
    if (suffix === "k") n *= 1_000;
    if (suffix === "m") n *= 1_000_000;
    // Small standalone integers (counts, "3 bedrooms", years, dates) are not
    // financial claims and are checked loosely.
    const financial = m[0]!.includes("$") || suffix !== "" || n >= 1000;
    if (!financial) continue;
    if (!m[0]!.includes("$") && !suffix && addressNumbers.has(raw)) continue;
    const near = allowed.some((a) => {
      const tol = Math.max(1, Math.abs(a) * (suffix ? 0.1 : 0.02));
      return Math.abs(a - n) <= tol;
    });
    if (!near) violations.push(`unsupported number ${m[0]!.trim()}`);
  }

  return { ok: violations.length === 0, violations };
}

/** The opener a role-facing surface should show: validated copy, or the seed. */
export function safeOpener(
  candidate: string | null | undefined,
  narrative: Narrative,
  facts: ClientFacts,
  role: NarrativeRole,
): string {
  if (candidate && copyAgreesWithFacts(candidate, facts, role).ok) return candidate.trim();
  return narrative.openerSeed;
}
