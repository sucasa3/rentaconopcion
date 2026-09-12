/**
 * Relationship graph vocabulary — pure and client-safe.
 *
 * A relationship row describes the real world and the evidence behind it.
 * It carries NO lifecycle that belongs somewhere else:
 *   invitations            -> professional_invitations
 *   claim / verification   -> professionals
 *   org connection         -> agent_lender_connections
 *   homeowner access       -> consent_records + classifyLenderAccess()
 *   subscription           -> Stripe / lender_orgs entitlement
 *   capacity activation    -> capacity logic (profile pool)
 */

export const RELATIONSHIP_STATUSES = [
  /** External/property evidence suggests a possible relationship. */
  "detected",
  /** SuCasa surfaced that evidence as a candidate for human review. */
  "suggested",
  /** A professional or agent explicitly states the relationship exists. */
  "asserted",
  /** The homeowner, or another independently authoritative process, confirmed it. */
  "confirmed",
  /** A human or trusted rule determined it is incorrect. */
  "rejected",
  /** A previously established relationship or confirmation was withdrawn. */
  "revoked",
] as const;
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

export const RELATIONSHIP_TYPES = [
  "homeowner_property",
  "agent_homeowner",
  /** The homeowner's actual lender / loan officer. */
  "professional_homeowner_lender",
  /** A mortgage resource the agent works with. Grants nothing about a homeowner. */
  "agent_professional_resource",
  "professional_professional",
  "professional_organization",
  "organization_homeowner",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_SOURCES = [
  "agent_import",
  "agent_confirmation",
  "homeowner_confirmation",
  "professional_import",
  "batchdata_property",
  "batchdata_mortgage",
  "closing_partner_import",
  "sucasa_admin",
  "future_integration",
] as const;
export type RelationshipSource = (typeof RELATIONSHIP_SOURCES)[number];

export type RelationshipEntity =
  | "homeowner"
  | "property"
  | "professional"
  | "organization"
  | "portfolio_client";

export interface RelationshipRow {
  id: string;
  relationship_type: RelationshipType;
  subject_type: RelationshipEntity;
  subject_id: string;
  object_type: RelationshipEntity;
  object_id: string;
  org_id: string | null;
  source: RelationshipSource;
  status: RelationshipStatus;
  confidence: number | null;
  evidence: Record<string, unknown>;
  consent_record_id: string | null;
  asserted_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  revoked_at: string | null;
}

/** Statuses that may progress to a stronger state. */
const OPEN_STATUSES: RelationshipStatus[] = ["detected", "suggested", "asserted", "confirmed"];

/**
 * Allowed status moves. Notably: an agent assertion can never move a row to
 * `confirmed` — only an independently authoritative confirmation can.
 */
export function canTransition(from: RelationshipStatus, to: RelationshipStatus): boolean {
  if (from === to) return true;
  switch (to) {
    case "suggested":
      return from === "detected";
    case "asserted":
      return from === "detected" || from === "suggested" || from === "rejected";
    case "confirmed":
      return from === "asserted" || from === "suggested" || from === "detected";
    case "rejected":
      return OPEN_STATUSES.includes(from);
    case "revoked":
      return from === "confirmed" || from === "asserted";
    default:
      return false;
  }
}

/**
 * A relationship row NEVER grants named homeowner access on its own.
 * Access is decided exclusively by `classifyLenderAccess()` + `consent_records`.
 * This helper exists so call sites can state that intent explicitly.
 */
export function grantsNamedHomeownerAccess(): false {
  return false;
}

/** True when the row is strong enough to justify inviting a professional. */
export function supportsInvitation(status: RelationshipStatus): boolean {
  return status === "asserted" || status === "confirmed";
}

export function isActive(row: Pick<RelationshipRow, "status" | "revoked_at">): boolean {
  return !row.revoked_at && row.status !== "rejected" && row.status !== "revoked";
}

/** Counting vocabulary — never collapse these into one number. */
export interface RelationshipCounts {
  /** detected + suggested */
  potential: number;
  /** asserted */
  asserted: number;
  /** confirmed */
  confirmed: number;
}

export function countRelationships(
  rows: Array<Pick<RelationshipRow, "status" | "revoked_at">>,
): RelationshipCounts {
  const live = rows.filter(isActive);
  return {
    potential: live.filter((r) => r.status === "detected" || r.status === "suggested").length,
    asserted: live.filter((r) => r.status === "asserted").length,
    confirmed: live.filter((r) => r.status === "confirmed").length,
  };
}
