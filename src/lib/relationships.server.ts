/**
 * Relationship graph writes — server side.
 *
 * INVARIANTS
 *  - A row here describes the real world and its evidence. It never carries
 *    invitation, claim, connection, subscription or capacity state.
 *  - Writing a row NEVER grants access to anything. Named homeowner access is
 *    decided only by `classifyLenderAccess()` + `consent_records`.
 *  - An agent assertion is `asserted`, never `confirmed`.
 */
import {
  canTransition,
  type RelationshipEntity,
  type RelationshipRow,
  type RelationshipSource,
  type RelationshipStatus,
  type RelationshipType,
} from "./relationships";
import { logNetworkEvent } from "./network-events.server";

const COLUMNS =
  "id, relationship_type, subject_type, subject_id, object_type, object_id, org_id, source, status, confidence, evidence, consent_record_id, asserted_by, confirmed_by, confirmed_at, revoked_at";

export interface EdgeRef {
  type: RelationshipType;
  subjectType: RelationshipEntity;
  subjectId: string;
  objectType: RelationshipEntity;
  objectId: string;
  orgId: string | null;
}

async function findEdge(admin: any, edge: EdgeRef): Promise<RelationshipRow | null> {
  let q = admin
    .from("relationships")
    .select(COLUMNS)
    .eq("relationship_type", edge.type)
    .eq("subject_type", edge.subjectType)
    .eq("subject_id", edge.subjectId)
    .eq("object_type", edge.objectType)
    .eq("object_id", edge.objectId);
  q = edge.orgId ? q.eq("org_id", edge.orgId) : q.is("org_id", null);
  const { data } = await q.maybeSingle();
  return (data ?? null) as RelationshipRow | null;
}

/**
 * Create a row at `detected`/`suggested`, or leave an existing stronger row
 * alone. Evidence is merged so provider detail is never lost.
 */
export async function upsertEvidenceRelationship(
  admin: any,
  edge: EdgeRef,
  input: {
    source: RelationshipSource;
    status?: Extract<RelationshipStatus, "detected" | "suggested">;
    confidence?: number | null;
    evidence?: Record<string, unknown>;
    sourceRecord?: Record<string, unknown> | null;
  },
): Promise<{ row: RelationshipRow; created: boolean }> {
  const existing = await findEdge(admin, edge);
  const status = input.status ?? "detected";

  if (existing) {
    const patch: Record<string, unknown> = {
      evidence: { ...(existing.evidence ?? {}), ...(input.evidence ?? {}) },
    };
    // Only ever refresh evidence; never weaken a human-established status.
    if (canTransition(existing.status, status) && existing.status === "detected") {
      patch["status"] = status;
    }
    const { data, error } = await admin
      .from("relationships")
      .update(patch)
      .eq("id", existing.id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { row: data as RelationshipRow, created: false };
  }

  const { data, error } = await admin
    .from("relationships")
    .insert({
      relationship_type: edge.type,
      subject_type: edge.subjectType,
      subject_id: edge.subjectId,
      object_type: edge.objectType,
      object_id: edge.objectId,
      org_id: edge.orgId,
      source: input.source,
      status,
      confidence: input.confidence ?? null,
      evidence: input.evidence ?? {},
      source_record: input.sourceRecord ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return { row: data as RelationshipRow, created: true };
}

/**
 * A professional or agent states the relationship exists.
 *
 * This supports invitation and follow-up verification. It does NOT confirm the
 * relationship and does NOT expose the homeowner.
 */
export async function assertRelationship(
  admin: any,
  edge: EdgeRef,
  input: {
    source: Extract<RelationshipSource, "agent_confirmation" | "professional_import" | "agent_import" | "closing_partner_import" | "sucasa_admin">;
    assertedBy: string;
    evidence?: Record<string, unknown>;
    sourceRelationshipId?: string | null;
  },
): Promise<RelationshipRow> {
  const existing = await findEdge(admin, edge);
  const now = new Date().toISOString();

  if (existing) {
    if (!canTransition(existing.status, "asserted")) return existing;
    const { data, error } = await admin
      .from("relationships")
      .update({
        status: "asserted",
        source: input.source,
        asserted_by: input.assertedBy,
        asserted_at: now,
        rejected_by: null,
        rejected_at: null,
        rejection_reason: null,
        revoked_at: null,
        evidence: { ...(existing.evidence ?? {}), ...(input.evidence ?? {}) },
        source_relationship_id: input.sourceRelationshipId ?? null,
      })
      .eq("id", existing.id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    await logNetworkEvent(admin, {
      action: "relationship_asserted",
      actorUserId: input.assertedBy,
      orgId: edge.orgId,
      entityType: "relationship",
      entityId: existing.id,
      detail: `${edge.type} asserted`,
      metadata: { relationship_type: edge.type, source: input.source, previous_status: existing.status },
    });
    return data as RelationshipRow;
  }

  const { data, error } = await admin
    .from("relationships")
    .insert({
      relationship_type: edge.type,
      subject_type: edge.subjectType,
      subject_id: edge.subjectId,
      object_type: edge.objectType,
      object_id: edge.objectId,
      org_id: edge.orgId,
      source: input.source,
      status: "asserted",
      asserted_by: input.assertedBy,
      asserted_at: now,
      evidence: input.evidence ?? {},
      source_relationship_id: input.sourceRelationshipId ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  await logNetworkEvent(admin, {
    action: "relationship_asserted",
    actorUserId: input.assertedBy,
    orgId: edge.orgId,
    entityType: "relationship",
    entityId: (data as RelationshipRow).id,
    detail: `${edge.type} asserted`,
    metadata: { relationship_type: edge.type, source: input.source, previous_status: null },
  });
  return data as RelationshipRow;
}

/**
 * An independently authoritative confirmation (homeowner, or an accepted
 * verification process). An agent's word can never reach this function.
 */
export async function confirmRelationship(
  admin: any,
  relationshipId: string,
  input: {
    source: Extract<RelationshipSource, "homeowner_confirmation" | "sucasa_admin">;
    confirmedBy: string;
    consentRecordId?: string | null;
    evidence?: Record<string, unknown>;
  },
): Promise<RelationshipRow> {
  const { data: existing } = await admin
    .from("relationships")
    .select(COLUMNS)
    .eq("id", relationshipId)
    .maybeSingle();
  if (!existing) throw new Error("Relationship not found");
  const row = existing as RelationshipRow;
  if (!canTransition(row.status, "confirmed")) return row;

  const { data, error } = await admin
    .from("relationships")
    .update({
      status: "confirmed",
      source: input.source,
      confirmed_by: input.confirmedBy,
      confirmed_at: new Date().toISOString(),
      consent_record_id: input.consentRecordId ?? row.consent_record_id ?? null,
      evidence: { ...(row.evidence ?? {}), ...(input.evidence ?? {}) },
      revoked_at: null,
    })
    .eq("id", relationshipId)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  await logNetworkEvent(admin, {
    action: "relationship_confirmed",
    actorUserId: input.confirmedBy,
    orgId: row.org_id,
    entityType: "relationship",
    entityId: relationshipId,
    detail: `${row.relationship_type} confirmed`,
    metadata: {
      relationship_type: row.relationship_type,
      source: input.source,
      has_consent_record: Boolean(input.consentRecordId ?? row.consent_record_id),
    },
  });
  return data as RelationshipRow;
}

export async function rejectRelationship(
  admin: any,
  relationshipId: string,
  input: { rejectedBy: string; reason?: string | null },
): Promise<RelationshipRow> {
  const { data: existing } = await admin
    .from("relationships")
    .select(COLUMNS)
    .eq("id", relationshipId)
    .maybeSingle();
  if (!existing) throw new Error("Relationship not found");
  const row = existing as RelationshipRow;
  if (!canTransition(row.status, "rejected")) return row;

  const { data, error } = await admin
    .from("relationships")
    .update({
      status: "rejected",
      rejected_by: input.rejectedBy,
      rejected_at: new Date().toISOString(),
      rejection_reason: input.reason ?? null,
    })
    .eq("id", relationshipId)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  await logNetworkEvent(admin, {
    action: "relationship_rejected",
    actorUserId: input.rejectedBy,
    orgId: row.org_id,
    entityType: "relationship",
    entityId: relationshipId,
    detail: input.reason ?? "Rejected by reviewer",
    metadata: { relationship_type: row.relationship_type, previous_status: row.status },
  });
  return data as RelationshipRow;
}
