/**
 * Lender -> agent -> homeowner introductions: the authoritative, pure rules.
 *
 * CORE RULE
 * ---------
 * No lender-identifiable homeowner exists before homeowner acceptance.
 *
 *   aggregate opportunity (computed, never stored as a request state)
 *     -> lender requests a CATEGORY  (no homeowner identifier anywhere)
 *     -> agent privately selects one of their own clients, or declines
 *     -> homeowner is invited and chooses lender-specific channels
 *     -> only the contact data for authorized channels is revealed
 *
 * Homeowner acceptance is NOT Home Profile permission: it never grants
 * mortgage, equity, valuation, property, document or broader financial access.
 * Those continue to flow solely through the existing consent architecture.
 *
 * Nothing in this workflow may create or vary an economic benefit for an agent
 * or a lender. See ECONOMIC_GUARDRAIL.
 */

import { CATEGORY_META } from "./opportunities";

// ---------------------------------------------------------------------------
// 1. State model
// ---------------------------------------------------------------------------

/**
 * `anonymous_opportunity` is deliberately NOT a state here: it is a computed
 * aggregate over the agent's own opportunity rows. An introduction record only
 * begins to exist once a lender asks, and it holds no client identifier then.
 */
export const INTRODUCTION_STATES = [
  "lender_requested",
  "agent_declined",
  "agent_offered",
  "homeowner_declined",
  "homeowner_accepted",
  "connection_active",
  "permission_revoked",
] as const;
export type IntroductionState = (typeof INTRODUCTION_STATES)[number];

const TRANSITIONS: Record<IntroductionState, IntroductionState[]> = {
  lender_requested: ["agent_offered", "agent_declined"],
  agent_declined: [],
  agent_offered: ["homeowner_accepted", "homeowner_declined"],
  homeowner_declined: [],
  // Acceptance immediately implies an active connection on at least one channel.
  homeowner_accepted: ["connection_active", "permission_revoked"],
  connection_active: ["connection_active", "permission_revoked"],
  permission_revoked: [],
};

export function canTransition(from: IntroductionState, to: IntroductionState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** States in which the homeowner has affirmatively accepted this introduction. */
const ACCEPTED_STATES = new Set<IntroductionState>(["homeowner_accepted", "connection_active"]);

/**
 * Server-side reveal gate. A lender may see identifiable homeowner data only
 * after acceptance AND only while at least one channel remains authorized.
 */
export function canRevealHomeowner(
  state: IntroductionState,
  grants: ChannelGrant[] = [],
): boolean {
  if (!ACCEPTED_STATES.has(state)) return false;
  return authorizedChannels(grants).length > 0;
}

/** Whether the agent may still act on this request. */
export function agentMayRespond(state: IntroductionState): boolean {
  return state === "lender_requested";
}

// ---------------------------------------------------------------------------
// 2. Channel-specific consent
// ---------------------------------------------------------------------------

export type IntroductionChannel = "call" | "text" | "email";
export const INTRODUCTION_CHANNELS: IntroductionChannel[] = ["call", "text", "email"];

export interface ChannelGrant {
  channel: IntroductionChannel;
  status: "granted" | "revoked";
}

export function authorizedChannels(grants: ChannelGrant[]): IntroductionChannel[] {
  return INTRODUCTION_CHANNELS.filter((c) =>
    grants.some((g) => g.channel === c && g.status === "granted"),
  );
}

/**
 * Revoking one channel does not end the introduction while another remains.
 * The introduction only becomes `permission_revoked` when every authorized
 * channel has been withdrawn.
 */
export function stateAfterRevocation(grants: ChannelGrant[]): IntroductionState {
  return authorizedChannels(grants).length > 0 ? "connection_active" : "permission_revoked";
}

/**
 * Suppression is scoped to { homeowner, lender org, purpose, channel }.
 * A lender-specific STOP or withdrawal never becomes a global SuCasa or agent
 * communication suppression unless the consumer expressly asks for that.
 */
export type SuppressionScope = "this_lender" | "all_communication";

export interface SuppressionRecord {
  homeownerRef: string;
  lenderOrgId: string;
  purpose: "introduction";
  channel: IntroductionChannel;
}

export function suppressionFor(
  homeownerRef: string,
  lenderOrgId: string,
  channels: IntroductionChannel[],
): SuppressionRecord[] {
  return channels.map((channel) => ({
    homeownerRef,
    lenderOrgId,
    purpose: "introduction" as const,
    channel,
  }));
}

// ---------------------------------------------------------------------------
// 3. Consent disclosure (versioned; wording may be finalised without changing
//    the consent architecture)
// ---------------------------------------------------------------------------

export const DISCLOSURE_VERSION = "intro_consent_v1";

export interface DisclosureInput {
  lenderOrgName: string;
  lenderContactName?: string | null;
  phone?: string | null;
  email?: string | null;
  channels: IntroductionChannel[];
  language?: "en" | "es";
}

export function consentDisclosure(input: DisclosureInput): string {
  const who = input.lenderContactName
    ? `${input.lenderOrgName} and ${input.lenderContactName}`
    : input.lenderOrgName;
  const destinations = [
    input.channels.includes("call") || input.channels.includes("text") ? input.phone : null,
    input.channels.includes("email") ? input.email : null,
  ].filter(Boolean) as string[];
  const where = destinations.length ? destinations.join(" / ") : "the contact details shown";
  const automated = input.channels.includes("call") || input.channels.includes("text");

  if (input.language === "es") {
    return [
      `Al seleccionar las opciones de comunicación anteriores y elegir “Conéctame”, usted autoriza a ${who} a comunicarse con usted en ${where} sobre esta conversación de financiamiento solicitada.`,
      automated
        ? "Si autoriza llamadas o mensajes de texto, las comunicaciones pueden incluir llamadas o mensajes enviados con tecnología automatizada o con voz artificial o pregrabada, cuando corresponda."
        : "",
      "El consentimiento no es una condición para comprar ninguna propiedad, bien o servicio. Pueden aplicarse tarifas de mensajes y datos. Puede retirar su consentimiento en cualquier momento.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `By selecting the communication options above and choosing “Connect me,” you authorize ${who} to contact you at ${where} regarding this requested financing conversation.`,
    automated
      ? "If you authorize calls or texts, communications may include calls or texts using automated technology or an artificial or prerecorded voice where applicable."
      : "",
    "Consent is not a condition of purchasing any property, goods, or services. Message and data rates may apply. You may withdraw your consent at any time.",
  ]
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// 4. Aggregate anonymity
// ---------------------------------------------------------------------------

/** Minimum population before an exact count may be shown to a lender. */
export const ANONYMITY_THRESHOLD = 5;

/**
 * Broad financing categories a lender may ask about. Narrower internal
 * categories collapse into these so a lender can never combine narrow filters
 * to reconstruct a small population.
 */
export const LENDER_CATEGORIES = {
  equity_access: {
    label: "Equity conversation",
    explanation: "Some homeowners may benefit from a conversation about using their equity.",
    internal: ["equity", "heloc"],
  },
  refinance_review: {
    label: "Mortgage review",
    explanation: "Signals suggest a financing review may be worthwhile for some homeowners.",
    internal: ["refinance_review", "rate_review", "pmi_removal"],
  },
  move_related: {
    label: "Move-related financing",
    explanation: "Some homeowners may be considering a move or a next purchase.",
    internal: ["move_up", "downsize", "relocation"],
  },
  investment: {
    label: "Investment financing",
    explanation: "Signals suggest possible interest in investment property financing.",
    internal: ["investment", "rental"],
  },
} as const;

export type LenderCategory = keyof typeof LENDER_CATEGORIES;

export function lenderCategoryFor(internal: string): LenderCategory | null {
  for (const [key, meta] of Object.entries(LENDER_CATEGORIES)) {
    if ((meta.internal as readonly string[]).includes(internal)) return key as LenderCategory;
  }
  return null;
}

export function lenderCategoryLabel(key: string): string {
  return (LENDER_CATEGORIES as Record<string, { label: string }>)[key]?.label ?? "Opportunity";
}

export interface AggregateOpportunity {
  category: LenderCategory;
  label: string;
  explanation: string;
  /** Exact count, or null when the population is too small to stay anonymous. */
  count: number | null;
  /** True when the count is withheld for anonymity. */
  suppressed: boolean;
}

/**
 * The ONLY opportunity shape a lender ever receives.
 *
 * Deliberately absent, to defeat reconstruction: client rows or ids, names,
 * initials, geography (city/metro/ZIP), value/equity/LTV/rate/tenure bands,
 * scores, individual signals, per-signal timestamps, historical deltas and any
 * narrower filter dimension. Counts below the anonymity threshold are withheld
 * rather than rounded, so a lender cannot difference two views to isolate a
 * homeowner.
 */
export function aggregateOpportunities(
  rows: { category: string }[],
  threshold = ANONYMITY_THRESHOLD,
): AggregateOpportunity[] {
  const counts = new Map<LenderCategory, number>();
  for (const row of rows) {
    const key = lenderCategoryFor(row.category);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, n]) => n > 0)
    .map(([category, n]) => {
      const meta = LENDER_CATEGORIES[category];
      const suppressed = n < threshold;
      return {
        category,
        label: meta.label,
        explanation: meta.explanation,
        count: suppressed ? null : n,
        suppressed,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Copy for a suppressed count. */
export const SUPPRESSED_COUNT_LABEL = "Opportunity detected";

// ---------------------------------------------------------------------------
// 5. Lender-facing vocabulary
// ---------------------------------------------------------------------------

export const LENDER_STATE_LABEL: Record<IntroductionState, string> = {
  lender_requested: "Awaiting agent review",
  agent_declined: "Not offered",
  agent_offered: "Awaiting homeowner response",
  homeowner_declined: "Homeowner declined",
  homeowner_accepted: "Homeowner accepted",
  connection_active: "Homeowner accepted",
  permission_revoked: "Permission withdrawn",
};

export const AGENT_STATE_LABEL: Record<IntroductionState, string> = {
  lender_requested: "Needs your decision",
  agent_declined: "You declined",
  agent_offered: "Sent to your client",
  homeowner_declined: "Client declined",
  homeowner_accepted: "Client accepted",
  connection_active: "Connected",
  permission_revoked: "Permission withdrawn",
};

// ---------------------------------------------------------------------------
// 6. Economic separation (RESPA)
// ---------------------------------------------------------------------------

/**
 * Introduction activity may never touch any of these. Enforced by the absence
 * of writes in introductions.server.ts and asserted by tests: no credit,
 * capacity, entitlement, plan, price, ranking, placement or benefit read or
 * write is permitted on any introduction transition, for either side.
 */
export const ECONOMIC_GUARDRAIL = {
  forbiddenTables: [
    "agent_credit_ledger",
    "agent_base_entitlements",
    "agent_plans",
    "org_addons",
    "plan_tiers",
    "premium_memberships",
    "premium_sponsorships",
    "sponsored_agent_seats",
    "sponsored_profiles",
    "lender_orgs",
  ],
  forbiddenFunctions: ["award_agent_credit", "agent_credit_summary", "org_profile_capacity"],
  /** Events that must never change pricing, benefits, placement or access level. */
  neutralEvents: [
    "lender_requested",
    "agent_offered",
    "agent_declined",
    "homeowner_accepted",
    "homeowner_declined",
    "application",
    "funded_loan",
    "closing",
  ],
} as const;

/** Internal category label, used only on agent-side surfaces. */
export function internalCategoryLabel(key: string): string {
  return CATEGORY_META[key as keyof typeof CATEGORY_META]?.label ?? key;
}
