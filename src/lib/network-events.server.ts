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
  | "homeowner_connection_declined"
  // Public agent acquisition and activation funnel. No homeowner PII.
  | "agent_landing_view"
  | "agent_start_clicked"
  | "agent_deck_viewed"
  | "agent_pricing_clicked"
  | "agent_signin_clicked"
  | "agent_signup_started"
  // Public lender acquisition funnel. No homeowner PII.
  | "lender_landing_view"
  | "lender_pilot_clicked"
  | "lender_pilot_submitted"
  | "lender_deck_viewed"
  | "lender_pricing_clicked"
  | "lender_signin_clicked"
  // Lender Opportunity Discovery funnel. No homeowner PII.
  | "lender_discovery_cta_clicked"
  | "lender_discovery_signup_started"
  | "lender_discovery_signup_completed"
  | "lender_discovery_started"
  | "lender_discovery_uploaded"
  | "lender_discovery_processing_viewed"
  | "lender_discovery_completed"
  | "lender_discovery_revealed"
  | "lender_discovery_opportunity_opened"
  | "lender_discovery_empty_result"
  | "lender_pilot_offer_viewed"
  | "lender_pilot_checkout_started"
  | "lender_pilot_checkout_completed"
  | "lender_pilot_checkout_cancelled"
  | "lender_discovery_export_requested"
  | "agent_signup_completed"
  | "agent_workspace_activated"
  | "agent_reveal_viewed"
  | "agent_reveal_upgrade_clicked"
  | "agent_import_started"
  | "agent_import_completed"
  | "agent_first_profile_created";

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

/** Idempotent funnel milestone keyed by action + entity identity. */
export async function logNetworkEventOnce(admin: any, input: NetworkEventInput): Promise<void> {
  try {
    if (input.entityType && input.entityId) {
      const { data } = await admin
        .from("compliance_audit_events")
        .select("id")
        .eq("category", "network_growth")
        .eq("action", input.action)
        .eq("entity_type", input.entityType)
        .eq("entity_id", input.entityId)
        .limit(1)
        .maybeSingle();
      if (data) return;
    }
    await logNetworkEvent(admin, input);
  } catch {
    /* observability must never fail the caller */
  }
}
