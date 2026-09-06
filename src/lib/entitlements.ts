/**
 * SuCasa entitlement policy — the one place the separation rule lives.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CORE RULE (do not weaken, do not work around):
 *
 *   No lender payment may directly or indirectly increase an agent's Home
 *   Profile capacity, account functionality, rewards or any other economic
 *   benefit.
 *
 * SuCasa has three separate relationships:
 *   1. SuCasa → Agent      SuCasa provides the agent's software and its base
 *                          Home Profile entitlement. Source is always SuCasa.
 *   2. SuCasa → Lender     The lender buys database intelligence, homeowner
 *                          Premium sponsorship capacity, branding and
 *                          relationship tooling from SuCasa.
 *   3. SuCasa → Homeowner  The homeowner holds their Home Profile and, when
 *                          eligible, a Premium Home Intelligence Membership.
 *
 * Anything that would route value from (2) into (1) is rejected here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Where an entitlement came from. Only `sucasa` and `agent_paid` may fund an agent. */
export type EntitlementSource =
  | "sucasa" // provided by SuCasa as part of the agent product
  | "agent_paid" // the agent bought their own continuation plan or add-on
  | "agent_earned" // the agent's own lender-neutral platform work
  | "lender_paid" // a lender subscription — never valid for an agent
  | "lender_sponsorship" // a lender sponsoring a homeowner — never valid for an agent
  | "mortgage_event"; // anything tied to a loan — never valid for anyone

const AGENT_ALLOWED_SOURCES: EntitlementSource[] = ["sucasa", "agent_paid", "agent_earned"];

/** Default Home Profiles SuCasa provides to every agent organization. */
export const DEFAULT_AGENT_BASE_PROFILES = 100;

/** Disclosure text version stamped onto sponsorships and consent records. */
export const DISCLOSURE_VERSION = "2026-09-v1";

export function isAgentEntitlementSourceAllowed(source: EntitlementSource): boolean {
  return AGENT_ALLOWED_SOURCES.includes(source);
}

/**
 * Guard every write that changes an agent's capacity or benefits.
 * Throws rather than silently ignoring, so a bad call site fails loudly.
 */
export function assertAgentEntitlementSource(source: EntitlementSource): void {
  if (!isAgentEntitlementSourceAllowed(source)) {
    throw new Error(
      `Blocked: an agent entitlement cannot come from "${source}". Agent capacity and benefits are provided by SuCasa or purchased by the agent — never funded by a lender or a mortgage event.`,
    );
  }
}

// --- Agent reward eligibility ----------------------------------------------

/**
 * Service categories where a reward would sit too close to a settlement
 * service. An agent never earns capacity for choosing, referring to, or
 * engaging any of these.
 */
export const SETTLEMENT_SERVICE_CATEGORIES = [
  "lender",
  "mortgage",
  "loan",
  "refinance",
  "title",
  "escrow",
  "closing",
  "settlement",
  "inspection",
  "inspector",
  "appraisal",
  "appraiser",
  "insurance",
  "attorney",
  "survey",
  "pest",
  "flood",
  "credit",
];

export function isSettlementServiceCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  const c = category.toLowerCase();
  return SETTLEMENT_SERVICE_CATEGORIES.some((s) => c.includes(s));
}

/** True only when the activity is the agent's own, lender-neutral platform work. */
export function isRewardableActivity(input: {
  kind: string;
  serviceCategory?: string | null;
  involvesLender?: boolean;
  involvesTransaction?: boolean;
}): boolean {
  if (input.involvesLender || input.involvesTransaction) return false;
  if (isSettlementServiceCategory(input.serviceCategory)) return false;
  return true;
}

// --- Premium funding --------------------------------------------------------

export type PremiumFundingSource = "homeowner_paid" | "sucasa_grant" | "sponsor_paid";

export const PREMIUM_PRICE_CENTS = 1900;

export function premiumFundingLabel(source: PremiumFundingSource): string {
  switch (source) {
    case "homeowner_paid":
      return "Your membership";
    case "sucasa_grant":
      return "Provided by SuCasa";
    case "sponsor_paid":
      return "Sponsored";
  }
}

// --- Homeowner permissions --------------------------------------------------

/**
 * Four separate, non-interchangeable permissions. Holding one never implies
 * another — in particular, an existing customer relationship is not permission
 * to see SuCasa-generated intelligence.
 */
export type ConsentType =
  | "existing_relationship"
  | "marketing_communication"
  | "intelligence_access"
  | "connection_request";

export const CONSENT_LABELS: Record<ConsentType, string> = {
  existing_relationship: "Existing customer relationship",
  marketing_communication: "Permission to send updates",
  intelligence_access: "Permission to see your SuCasa insights",
  connection_request: "You asked to be connected",
};

/** Can this organization see SuCasa-generated intelligence for this homeowner? */
export function canAccessIntelligence(
  consents: { consent_type: ConsentType; status: string }[],
): boolean {
  return consents.some((c) => c.consent_type === "intelligence_access" && c.status === "granted");
}
