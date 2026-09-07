/**
 * Lender access gate, outreach-channel gate and compliance vocabulary.
 *
 * Client-safe and pure: every rule here is also enforced server-side, but the
 * UI imports the same functions so a screen can never show more than the gate
 * allows.
 *
 * Core rules, in order of importance:
 *  1. Sponsoring a homeowner's Premium membership grants NOTHING individual.
 *  2. Being connected to the homeowner's agent grants NOTHING individual.
 *  3. A lender's own relationship grants a NAMED workflow plus the categories
 *     of SuCasa intelligence that relationship's documented scope permits —
 *     never automatically "everything".
 *  4. Visibility is not permission to contact: each channel is gated
 *     separately by consent and suppression state.
 *  5. Nothing here ranks people by anything a lender may not lawfully use.
 */

// ---------------------------------------------------------------------------
// 1. Relationship classification
// ---------------------------------------------------------------------------

export type LenderAccessCategory =
  | "own_relationship"
  | "asked_to_connect"
  | "sponsored_only"
  | "agent_connected_only"
  | "none";

/** Categories of SuCasa-generated intelligence a relationship can be scoped to. */
export const INTELLIGENCE_SCOPES = [
  "contact",
  "property_snapshot",
  "valuation",
  "mortgage",
  "equity",
  "engagement",
  "home_projects",
] as const;
export type IntelligenceScope = (typeof INTELLIGENCE_SCOPES)[number];

/**
 * Baseline for a documented lender-owned relationship with no wider scope on
 * file. Mortgage and equity are included because, for the lender's own book,
 * they derive from that lender's own loan record — not from third-party data.
 */
export const BASELINE_OWN_RELATIONSHIP_SCOPE: IntelligenceScope[] = [
  "contact",
  "property_snapshot",
  "valuation",
  "mortgage",
  "equity",
];


export interface AccessInput {
  /** Documented basis on the book record, e.g. "lender_upload", "existing_customer". */
  relationshipBasis?: string | null;
  /** Documented intelligence categories for this relationship. */
  intelligenceAccessScope?: string[] | null;
  /** Homeowner affirmatively asked this lender to contact them. */
  hasConnectionRequest?: boolean;
  /** Scope the homeowner authorised with that request. */
  connectionRequestScope?: string[] | null;
  /** Homeowner granted this lender access to SuCasa intelligence. */
  hasIntelligenceConsent?: boolean;
  intelligenceConsentScope?: string[] | null;
  /** This lender funds the homeowner's Premium membership. */
  isSponsored?: boolean;
  /** Homeowner belongs to an agent this lender is connected to. */
  isAgentConnected?: boolean;
}

/** Relationship bases that establish the lender's own, independent relationship. */
const OWN_RELATIONSHIP_BASES = new Set([
  "lender_upload",
  "org_uploaded",
  "uploaded",
  "csv_import",
  "existing_customer",
  "existing_relationship",
  "own_relationship",
  "servicing",
  "past_borrower",
  "borrower",
  "client",
  "import",
]);


export interface LenderAccess {
  category: LenderAccessCategory;
  /** May the homeowner be shown by name, with contact details, individually? */
  named: boolean;
  /** May they appear in the ranked contact queue? */
  inQueue: boolean;
  /** Intelligence categories permitted for this lender/homeowner pair. */
  scopes: IntelligenceScope[];
  /** Plain-language explanation shown in the UI and stored in audits. */
  reason: string;
}

function normaliseScopes(input: (string | null | undefined)[] | null | undefined) {
  const out: IntelligenceScope[] = [];
  for (const s of input ?? []) {
    if (s && (INTELLIGENCE_SCOPES as readonly string[]).includes(s)) {
      if (!out.includes(s as IntelligenceScope)) out.push(s as IntelligenceScope);
    }
  }
  return out;
}

export function classifyLenderAccess(input: AccessInput): LenderAccess {
  const own = OWN_RELATIONSHIP_BASES.has((input.relationshipBasis ?? "").trim());

  if (input.hasConnectionRequest) {
    const scopes = normaliseScopes([
      "contact",
      ...(input.connectionRequestScope ?? []),
      ...(input.hasIntelligenceConsent ? (input.intelligenceConsentScope ?? []) : []),
      ...(own ? (input.intelligenceAccessScope ?? BASELINE_OWN_RELATIONSHIP_SCOPE) : []),
    ]);
    return {
      category: "asked_to_connect",
      named: true,
      inQueue: true,
      scopes,
      reason: "Homeowner asked to connect and authorised what may be shared.",
    };
  }

  if (own) {
    const documented = normaliseScopes(input.intelligenceAccessScope);
    const consented = input.hasIntelligenceConsent
      ? normaliseScopes(input.intelligenceConsentScope)
      : [];
    const scopes = normaliseScopes([
      ...(documented.length ? documented : BASELINE_OWN_RELATIONSHIP_SCOPE),
      ...consented,
    ]);
    return {
      category: "own_relationship",
      named: true,
      inQueue: true,
      scopes,
      reason: "Lender's own documented relationship, limited to its recorded scope.",
    };
  }

  if (input.isSponsored) {
    return {
      category: "sponsored_only",
      named: false,
      inQueue: false,
      scopes: [],
      reason: "Sponsorship funds the membership only — it grants no individual access.",
    };
  }

  if (input.isAgentConnected) {
    return {
      category: "agent_connected_only",
      named: false,
      inQueue: false,
      scopes: [],
      reason: "An agent connection is not a data permission.",
    };
  }

  return {
    category: "none",
    named: false,
    inQueue: false,
    scopes: [],
    reason: "No documented basis to access this homeowner.",
  };
}

export function hasScope(access: LenderAccess, scope: IntelligenceScope) {
  return access.scopes.includes(scope);
}

// ---------------------------------------------------------------------------
// 2. Outreach channel gate
// ---------------------------------------------------------------------------

export type OutreachChannel = "call" | "text" | "email";

export interface ChannelPermissionRecord {
  email_allowed?: boolean | null;
  sms_allowed?: boolean | null;
  phone_allowed?: boolean | null;
  automated_contact_allowed?: boolean | null;
  do_not_call?: boolean | null;
  do_not_text?: boolean | null;
  do_not_email?: boolean | null;
  consent_source?: string | null;
  consent_basis?: string | null;
  consent_at?: string | null;
}

export interface ChannelDecision {
  allowed: boolean;
  /** Automated / campaign sending, stricter than a manual one-to-one touch. */
  automatedAllowed: boolean;
  reason: string;
}

/**
 * Which contact details exist on the record. Missing data is not the same as
 * missing permission, and the UI must be able to say which one it is.
 */
export interface ContactDetailAvailability {
  hasPhone?: boolean;
  hasEmail?: boolean;
}

/**
 * A homeowner who asked this lender to contact them has given an affirmative,
 * channel-appropriate invitation for a manual reply. The lender's own existing
 * customer may also be contacted manually, one to one. Everything wider —
 * automated or campaign sending — still needs a recorded permission, and
 * suppression flags always win.
 */
export function channelDecision(
  channel: OutreachChannel,
  perm: ChannelPermissionRecord | null | undefined,
  access: LenderAccess,
  contact?: ContactDetailAvailability,
): ChannelDecision {
  const suppressed =
    (channel === "call" && perm?.do_not_call) ||
    (channel === "text" && perm?.do_not_text) ||
    (channel === "email" && perm?.do_not_email);

  if (suppressed) {
    return {
      allowed: false,
      automatedAllowed: false,
      reason: `Homeowner is on the do-not-${channel === "call" ? "call" : channel} list.`,
    };
  }
  if (!access.named) {
    return { allowed: false, automatedAllowed: false, reason: access.reason };
  }

  if (contact) {
    const present = channel === "email" ? contact.hasEmail : contact.hasPhone;
    if (!present) {
      return {
        allowed: false,
        automatedAllowed: false,
        reason:
          channel === "email"
            ? "No email address on file for this homeowner."
            : "No phone number on file for this homeowner.",
      };
    }
  }

  const explicit =
    channel === "call"
      ? perm?.phone_allowed
      : channel === "text"
        ? perm?.sms_allowed
        : perm?.email_allowed;

  if (explicit) {
    return {
      allowed: true,
      automatedAllowed: Boolean(perm?.automated_contact_allowed),
      reason: `Permission on file (${perm?.consent_basis ?? "recorded"}).`,
    };
  }

  if (access.category === "asked_to_connect") {
    return {
      allowed: true,
      automatedAllowed: false,
      reason: "Homeowner asked to be contacted — manual reply only.",
    };
  }

  if (access.category === "own_relationship") {
    return {
      allowed: true,
      automatedAllowed: false,
      reason: "Your existing customer — manual, one-to-one contact only.",
    };
  }

  return {
    allowed: false,
    automatedAllowed: false,
    reason: "No contact permission recorded for this channel.",
  };
}

export function allowedChannels(
  perm: ChannelPermissionRecord | null | undefined,
  access: LenderAccess,
  contact?: ContactDetailAvailability,
): OutreachChannel[] {
  return (["call", "text", "email"] as OutreachChannel[]).filter(
    (c) => channelDecision(c, perm, access, contact).allowed,
  );
}


// ---------------------------------------------------------------------------
// 3. Compliance vocabulary
// ---------------------------------------------------------------------------

/**
 * Claims a lender may not make off the back of SuCasa intelligence. These are
 * validated on generated output; offending output is regenerated, never
 * word-stripped, because deleting a word can leave a misleading sentence.
 */
export const PROHIBITED_CLAIM_PATTERNS: { code: string; pattern: RegExp; why: string }[] = [
  { code: "qualified", pattern: /\bpre-?qualif\w*|\bqualif(y|ies|ied|ication)\b/i, why: "implies a credit decision" },
  { code: "approved", pattern: /\b(pre-?)?approv\w*/i, why: "implies a credit decision" },
  { code: "eligible", pattern: /\beligib\w*/i, why: "implies a credit decision" },
  { code: "guaranteed_savings", pattern: /\bguarantee\w*\b[^.]{0,40}\b(saving|rate|payment)/i, why: "promises an outcome" },
  { code: "guaranteed", pattern: /\byou (will|can) save\b|\bguaranteed\b/i, why: "promises an outcome" },
  { code: "preferred_lender", pattern: /\b(preferred|recommended|best) lender\b/i, why: "implies a steering endorsement" },
  { code: "credit_score", pattern: /\bcredit (score|worthiness)\b|\bcreditworth\w*/i, why: "not a credit-decision engine" },
  { code: "underwriting", pattern: /\b(underwrit\w*|likely to be (approved|denied))\b/i, why: "not an underwriting engine" },
  { code: "borrowing_power", pattern: /\byou can borrow\b|\bavailable borrowing power\b/i, why: "states an amount that was never underwritten" },
];

export interface LanguageCheck {
  ok: boolean;
  violations: { code: string; why: string; excerpt: string }[];
}

export function checkLenderLanguage(text: string): LanguageCheck {
  const violations: LanguageCheck["violations"] = [];
  for (const rule of PROHIBITED_CLAIM_PATTERNS) {
    const m = rule.pattern.exec(text);
    if (m) {
      const at = Math.max(0, (m.index ?? 0) - 40);
      violations.push({ code: rule.code, why: rule.why, excerpt: text.slice(at, at + 120).trim() });
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Instruction block prepended to every lender-facing generation. */
export const LENDER_LANGUAGE_RULES = `Compliance rules you must follow exactly:
- This is relationship outreach, never a credit decision. Never say or imply that the homeowner is qualified, prequalified, approved, eligible, creditworthy, likely to be approved, or that any savings, rate or payment is guaranteed.
- Never state a borrowing amount or "available borrowing power".
- Never describe anyone as the preferred, recommended or best lender.
- Every number you use must come from the FACTS provided, and every estimated figure must be described as an estimate.
- Suggest a conversation or a review, never a specific credit product the homeowner should take.
- If a fact is missing, leave it out. Never invent mortgage, rate or value data.`;

export const COMPLIANCE_NOTES = [
  "Estimated values and equity are informational only. They are not an appraisal, a credit decision or an offer of credit.",
  "This homeowner has not been evaluated for loan eligibility.",
  "Confirm contact permissions and applicable do-not-contact rules before reaching out.",
];

// ---------------------------------------------------------------------------
// 4. Fair-lending guardrail
// ---------------------------------------------------------------------------

/**
 * Inputs that must never reach contact-priority ranking, opportunity scoring
 * or recommendations — directly, or via a proxy chosen to recreate them.
 */
export const PROHIBITED_RANKING_INPUTS = [
  "race",
  "ethnicity",
  "national_origin",
  "religion",
  "sex",
  "gender",
  "marital_status",
  "age",
  "familial_status",
  "disability",
  "public_assistance",
  "neighborhood_racial_composition",
  "neighborhood_ethnic_composition",
  "demographic_segment",
  "protected_class_inference",
  "surname_ethnicity_proxy",
  "language_preference_proxy",
  "credit_score",
  "approval_probability",
  "denial_probability",
  "sponsorship",
  "sponsor_org",
  "agent_connection",
  "referral_volume",
] as const;

/** Everything the ranking engine is allowed to consider. */
export const PERMITTED_RANKING_INPUTS = [
  "estimated_value",
  "value_change",
  "estimated_equity",
  "equity_change",
  "estimated_ltv",
  "estimated_mortgage_balance",
  "loan_age",
  "tenure_years",
  "permit_activity",
  "property_change",
  "tax_change",
  "home_project_need",
  "homeowner_engagement",
  "homeowner_request",
  "days_since_contact",
  "prior_outcome",
] as const;

export type PermittedRankingInput = (typeof PERMITTED_RANKING_INPUTS)[number];

export function auditRankingInputs(fields: string[]): {
  ok: boolean;
  prohibited: string[];
  unrecognised: string[];
} {
  const prohibited = fields.filter((f) =>
    (PROHIBITED_RANKING_INPUTS as readonly string[]).includes(f),
  );
  const unrecognised = fields.filter(
    (f) =>
      !(PERMITTED_RANKING_INPUTS as readonly string[]).includes(f) && !prohibited.includes(f),
  );
  return { ok: prohibited.length === 0, prohibited, unrecognised };
}

// ---------------------------------------------------------------------------
// 5. Lender review opportunities
// ---------------------------------------------------------------------------

export type ReviewType =
  | "equity_review"
  | "mortgage_checkup"
  | "home_equity_conversation"
  | "refinance_review"
  | "move_planning"
  | "improvement_planning"
  | "ownership_anniversary"
  | "value_milestone"
  | "equity_milestone"
  | "property_change";

export interface ReviewMeta {
  label: string;
  /** Neutral, non-promissory description of the conversation. */
  blurb: string;
  action: string;
  /** Facts that must be present for this review to be created at all. */
  requires: PermittedRankingInput[];
}

export const REVIEW_TYPES: Record<ReviewType, ReviewMeta> = {
  equity_review: {
    label: "Equity review",
    blurb: "Estimated equity has increased meaningfully.",
    action: "Send an equity update",
    requires: ["estimated_equity", "estimated_value"],
  },
  mortgage_checkup: {
    label: "Mortgage checkup",
    blurb: "It may be worth reviewing the homeowner's current mortgage position.",
    action: "Offer an annual mortgage review",
    requires: ["loan_age"],
  },
  home_equity_conversation: {
    label: "Home equity conversation",
    blurb:
      "Estimated equity may support a conversation about home improvement or liquidity options.",
    action: "Offer an equity review",
    requires: ["estimated_equity", "estimated_ltv"],
  },
  refinance_review: {
    label: "Refinance review",
    blurb: "Recorded mortgage information suggests a review could be timely.",
    action: "Offer to review the current mortgage",
    requires: ["estimated_mortgage_balance", "loan_age"],
  },
  move_planning: {
    label: "Move planning",
    blurb: "Long tenure and estimated equity may make a move-planning conversation timely.",
    action: "Offer a home financing planning review",
    requires: ["tenure_years", "estimated_equity"],
  },
  improvement_planning: {
    label: "Improvement planning",
    blurb: "Home project needs suggest planning ahead could be useful.",
    action: "Ask about upcoming projects",
    requires: ["home_project_need"],
  },
  ownership_anniversary: {
    label: "Ownership anniversary",
    blurb: "A homeownership anniversary is a natural moment to check in.",
    action: "Send an annual home and equity update",
    requires: ["tenure_years"],
  },
  value_milestone: {
    label: "Value milestone",
    blurb: "Estimated value crossed a notable threshold.",
    action: "Send a home wealth update",
    requires: ["estimated_value", "value_change"],
  },
  equity_milestone: {
    label: "Equity milestone",
    blurb: "Estimated equity crossed a notable share of the home's estimated value.",
    action: "Offer an equity review",
    requires: ["estimated_equity", "estimated_ltv"],
  },
  property_change: {
    label: "Property change",
    blurb: "A notable property, tax or permit change was detected.",
    action: "Check in with the homeowner",
    requires: ["property_change"],
  },
};

export function reviewLabel(type: string) {
  return REVIEW_TYPES[type as ReviewType]?.label ?? "Homeowner review";
}

export interface ReviewOpportunity {
  type: ReviewType;
  label: string;
  blurb: string;
  action: string;
  /** Traceable machine reasons, e.g. ["equity_threshold_crossed"]. */
  reasonCodes: string[];
  /** The exact facts the review was built from. */
  sourceFields: PermittedRankingInput[];
  /** Human "why now" lines. */
  why: string[];
  /** 0–100 contact priority. Never a credit or approval score. */
  priority: number;
}

/**
 * A review may only exist when the specific facts behind it are present.
 * Generic property data alone never creates a mortgage-product review.
 */
export function supportsReview(
  type: ReviewType,
  available: Partial<Record<PermittedRankingInput, unknown>>,
): boolean {
  return REVIEW_TYPES[type].requires.every(
    (f) => available[f] !== null && available[f] !== undefined,
  );
}

export const PRIORITY_LABEL = "Contact Priority";

export function priorityBand(priority: number, askedToConnect = false) {
  if (askedToConnect) return "hot" as const;
  if (priority >= 75) return "hot" as const;
  if (priority >= 50) return "warm" as const;
  return "nurture" as const;
}
