/**
 * Growth/funnel events for the organic-network loop.
 *
 * Reuses the existing `compliance_audit_events` ledger — there is no second
 * analytics table. Metadata carries IDs, statuses and sources only: never a
 * homeowner name, address, email or phone.
 */

export type NetworkEventAction =
  | "home_team_candidate_detected"
  | "home_team_candidate_suppressed"
  | "home_team_candidate_suggested"
  | "home_team_candidate_resolved"
  | "home_team_candidate_rejected"
  | "home_team_reviewed"
  | "relationship_asserted"
  | "relationship_confirmed"
  | "relationship_rejected"
  | "possible_duplicate_detected"
  | "professional_identity_linked"
  | "professional_identity_created"
  // Invitation lifecycle — distinct from relationship, identity and access.
  | "professional_invitation_created"
  | "professional_invitation_sent"
  | "professional_invitation_resent"
  | "professional_invitation_accepted"
  | "professional_invitation_declined"
  | "professional_invitation_revoked"
  | "professional_identity_claimed"
  | "professional_identity_reconciliation_required"
  // Homeowner validation (relationship truth) and the separate consent step.
  | "homeowner_validation_requested"
  | "homeowner_relationship_confirmed"
  | "homeowner_relationship_rejected"
  | "homeowner_relationship_unknown"
  | "homeowner_connection_granted"
  | "homeowner_connection_declined";

export interface NetworkEventInput {
  action: NetworkEventAction;
  actorUserId?: string | null;
  orgId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
}

/** Never let analytics break the write it is observing. */
export async function logNetworkEvent(admin: any, input: NetworkEventInput): Promise<void> {
  try {
    await admin.from("compliance_audit_events").insert({
      category: "network_growth",
      action: input.action,
      actor_user_id: input.actorUserId ?? null,
      org_id: input.orgId ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      detail: input.detail ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    /* observability must never fail the caller */
  }
}

export async function logNetworkEvents(admin: any, inputs: NetworkEventInput[]): Promise<void> {
  if (!inputs.length) return;
  try {
    await admin.from("compliance_audit_events").insert(
      inputs.map((input) => ({
        category: "network_growth",
        action: input.action,
        actor_user_id: input.actorUserId ?? null,
        org_id: input.orgId ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        detail: input.detail ?? null,
        metadata: input.metadata ?? {},
      })),
    );
  } catch {
    /* ignore */
  }
}
