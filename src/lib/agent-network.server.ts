/**
 * Agent Professional Network + Home Team review — server side.
 *
 * Every function here takes an ALREADY VERIFIED agent organization id: the
 * caller (`agent-network.functions.ts`) proves membership and record ownership
 * before anything below runs.
 *
 * Invariants
 *  - The network is workspace scoped: `agent_professional_resource` with the
 *    agent organization as subject and the professional as object.
 *  - Working with a professional says NOTHING about any client's lender.
 *  - A homeowner-confirmed lender is never rejected, replaced or overwritten.
 *  - Review state answers "reviewed?" only; the lender itself is derived from
 *    the relationship graph.
 *  - No relationship written here grants named homeowner access.
 */
import {
  visibleProfessionalContact,
  visibleProfessionalDisplay,
  type BulkResult,
  type NetworkProfessional,
  type ReviewDecision,
  type ReviewQueueItem,
} from "./agent-network";
import { logNetworkEvent } from "./network-events.server";
import { normalizeEmail, normalizePhone, type ProfessionalIdentityInput } from "./professionals";
import { resolveOrCreateProfessional } from "./professionals.server";
import { assertRelationship, rejectRelationship } from "./relationships.server";
import type { RelationshipRow, RelationshipStatus } from "./relationships";

const REL_COLUMNS =
  "id, relationship_type, subject_type, subject_id, object_type, object_id, org_id, source, status, confidence, evidence, consent_record_id, asserted_by, confirmed_by, confirmed_at, revoked_at";

const PRO_COLUMNS =
  "id, user_id, org_id, org_name_raw, roles, full_name, email_normalized, email_verified, phone_normalized, phone_verified, nmls_id, license_number, license_state, claim_status, verification_status";

const ACTIVE_STATUSES = ["detected", "suggested", "asserted", "confirmed"];

/** Portfolio client ids that belong to this agent workspace. */
export async function workspaceClientIds(admin: any, orgId: string): Promise<string[]> {
  const { data: portfolios } = await admin
    .from("lender_portfolios")
    .select("id")
    .eq("lender_org_id", orgId);
  const ids = (portfolios ?? []).map((p: any) => p.id);
  if (!ids.length) return [];
  const { data: clients } = await admin
    .from("lender_portfolio_clients")
    .select("id")
    .in("portfolio_id", ids)
    .is("archived_at", null);
  return (clients ?? []).map((c: any) => c.id);
}

export async function clientBelongsToWorkspace(
  admin: any,
  orgId: string,
  portfolioClientId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("lender_portfolio_clients")
    .select("id, lender_portfolios!inner(lender_org_id)")
    .eq("id", portfolioClientId)
    .eq("lender_portfolios.lender_org_id", orgId)
    .maybeSingle();
  return Boolean(data);
}

// --- My people -------------------------------------------------------------

/** Workspace-supplied contact lives on the workspace's own edge, not the registry. */
function suppliedContact(evidence: Record<string, unknown> | null | undefined) {
  const e = (evidence ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof e[k] === "string" ? (e[k] as string) : null);
  return {
    email: str("workspace_email"),
    phone: str("workspace_phone"),
    displayName: str("workspace_display_name"),
    orgName: str("workspace_org_name"),
  };
}

export async function listAgentProfessionalNetwork(
  admin: any,
  orgId: string,
): Promise<NetworkProfessional[]> {
  const { data: edges } = await admin
    .from("relationships")
    .select(REL_COLUMNS + ", asserted_at")
    .eq("relationship_type", "agent_professional_resource")
    .eq("subject_type", "organization")
    .eq("subject_id", orgId)
    .in("status", ACTIVE_STATUSES)
    .is("revoked_at", null);

  const rows = (edges ?? []) as Array<RelationshipRow & { asserted_at: string | null }>;
  const proIds = [...new Set(rows.map((r) => r.object_id))];
  if (!proIds.length) return [];

  const [{ data: pros }, { data: lenderEdges }] = await Promise.all([
    admin.from("professionals").select(PRO_COLUMNS).in("id", proIds),
    admin
      .from("relationships")
      .select("object_id, subject_id, status")
      .eq("relationship_type", "professional_homeowner_lender")
      .eq("org_id", orgId)
      .in("status", ACTIVE_STATUSES)
      .is("revoked_at", null),
  ]);

  const counts = new Map<string, number>();
  for (const e of lenderEdges ?? []) {
    counts.set(e.subject_id, (counts.get(e.subject_id) ?? 0) + 1);
  }

  const byId = new Map((pros ?? []).map((p: any) => [p.id, p]));
  const out: NetworkProfessional[] = [];
  for (const edge of rows) {
    const p = byId.get(edge.object_id) as any;
    if (!p) continue;
    const supplied = suppliedContact(edge.evidence);
    const contact = visibleProfessionalContact(p, supplied);
    const display = visibleProfessionalDisplay(p, supplied);
    out.push({
      id: p.id,
      full_name: display.fullName,
      org_name: display.orgName,
      roles: (p.roles ?? []) as string[],
      email: contact.email,
      phone: contact.phone,
      clientCount: counts.get(p.id) ?? 0,
      hasSucasaIdentity: Boolean(p.user_id) || p.claim_status === "claimed",
      needsReview: Boolean((edge.evidence as any)?.["possible_duplicate"]),
      lastUsedAt: edge.asserted_at ?? null,
    });
  }
  return out;
}

export interface AddProfessionalInput extends ProfessionalIdentityInput {
  roles?: string[];
}

/**
 * Add someone this workspace works with.
 *
 * Contact details typed here are kept on the workspace's own edge; the shared
 * registry only receives them as unverified identity-resolution fields.
 */
export async function addAgentProfessional(
  admin: any,
  args: { orgId: string; userId: string; input: AddProfessionalInput },
): Promise<{ professionalId: string; created: boolean; possibleDuplicates: number }> {
  const { professional, created, possibleDuplicates } = await resolveOrCreateProfessional(
    admin,
    { ...args.input, createdBy: args.userId, roles: args.input.roles ?? ["loan_officer"] },
    // A reviewable duplicate must not block the agent; the edge records it.
    { createOnPossible: true },
  );
  if (!professional) throw new Error("Could not create this professional");

  await assertRelationship(
    admin,
    {
      type: "agent_professional_resource",
      subjectType: "organization",
      subjectId: args.orgId,
      objectType: "professional",
      objectId: professional.id,
      orgId: args.orgId,
    },
    {
      source: "agent_confirmation",
      assertedBy: args.userId,
      evidence: {
        workspace_email: normalizeEmail(args.input.email),
        workspace_phone: normalizePhone(args.input.phone),
        possible_duplicate: possibleDuplicates.length > 0,
      },
    },
  );

  return {
    professionalId: professional.id,
    created,
    possibleDuplicates: possibleDuplicates.length,
  };
}

/** Correct what this workspace knows. The shared registry name is only touched while unclaimed. */
export async function updateAgentProfessional(
  admin: any,
  args: {
    orgId: string;
    userId: string;
    professionalId: string;
    fullName?: string;
    orgNameRaw?: string | null;
    email?: string | null;
    phone?: string | null;
  },
): Promise<void> {
  const { data: edge } = await admin
    .from("relationships")
    .select(REL_COLUMNS)
    .eq("relationship_type", "agent_professional_resource")
    .eq("subject_id", args.orgId)
    .eq("object_id", args.professionalId)
    .maybeSingle();
  if (!edge) throw new Error("This professional is not in your network");

  const { data: pro } = await admin
    .from("professionals")
    .select(PRO_COLUMNS)
    .eq("id", args.professionalId)
    .maybeSingle();
  if (!pro) throw new Error("Professional not found");

  if (pro.claim_status === "unclaimed") {
    const patch: Record<string, unknown> = {};
    if (args.fullName?.trim()) patch["full_name"] = args.fullName.trim();
    if (args.orgNameRaw !== undefined) patch["org_name_raw"] = args.orgNameRaw;
    if (!pro.email_verified && args.email !== undefined)
      patch["email_normalized"] = normalizeEmail(args.email);
    if (!pro.phone_verified && args.phone !== undefined)
      patch["phone_normalized"] = normalizePhone(args.phone);
    if (Object.keys(patch).length) {
      await admin.from("professionals").update(patch).eq("id", args.professionalId);
    }
  }

  await admin
    .from("relationships")
    .update({
      evidence: {
        ...((edge.evidence ?? {}) as Record<string, unknown>),
        ...(args.email !== undefined ? { workspace_email: normalizeEmail(args.email) } : {}),
        ...(args.phone !== undefined ? { workspace_phone: normalizePhone(args.phone) } : {}),
      },
    })
    .eq("id", edge.id);
}

// --- Home Team review queue ------------------------------------------------

export async function listHomeTeamQueue(
  admin: any,
  orgId: string,
): Promise<{ items: ReviewQueueItem[]; total: number }> {
  const clientIds = await workspaceClientIds(admin, orgId);
  if (!clientIds.length) return { items: [], total: 0 };

  const [{ data: clients }, { data: candidates }, { data: lenderEdges }, { data: reviews }] =
    await Promise.all([
      admin
        .from("lender_portfolio_clients")
        .select("id, client_name, address_line1, city, state")
        .in("id", clientIds),
      admin
        .from("home_team_candidates")
        .select("id, portfolio_client_id, candidate_name, confidence, status, role")
        .in("portfolio_client_id", clientIds)
        .in("status", ["detected", "suggested", "resolved"]),
      admin
        .from("relationships")
        .select(REL_COLUMNS)
        .eq("relationship_type", "professional_homeowner_lender")
        .eq("object_type", "portfolio_client")
        .in("object_id", clientIds)
        .in("status", ["asserted", "confirmed"])
        .is("revoked_at", null),
      admin
        .from("home_team_review_state")
        .select("portfolio_client_id, decision")
        .eq("agent_org_id", orgId),
    ]);

  const proIds = [...new Set((lenderEdges ?? []).map((e: any) => e.subject_id))];
  const { data: pros } = proIds.length
    ? await admin.from("professionals").select("id, full_name").in("id", proIds)
    : { data: [] as any[] };
  const proName = new Map((pros ?? []).map((p: any) => [p.id, p.full_name]));
  const decision = new Map(
    (reviews ?? []).map((r: any) => [r.portfolio_client_id, r.decision as ReviewDecision]),
  );

  const edgeByClient = new Map<string, any>();
  for (const e of lenderEdges ?? []) {
    const prior = edgeByClient.get(e.object_id);
    // A homeowner confirmation always wins the display slot.
    if (!prior || (e.status === "confirmed" && prior.status !== "confirmed")) {
      edgeByClient.set(e.object_id, e);
    }
  }

  const suggestionsByClient = new Map<string, ReviewQueueItem["suggestions"]>();
  for (const c of candidates ?? []) {
    const list = suggestionsByClient.get(c.portfolio_client_id) ?? [];
    list.push({ candidateId: c.id, institution: c.candidate_name, confidence: c.confidence });
    suggestionsByClient.set(c.portfolio_client_id, list);
  }

  const items: ReviewQueueItem[] = (clients ?? []).map((c: any) => {
    const edge = edgeByClient.get(c.id);
    return {
      portfolioClientId: c.id,
      clientName: c.client_name ?? "Client",
      address: [c.address_line1, c.city, c.state].filter(Boolean).join(", ") || null,
      suggestions: suggestionsByClient.get(c.id) ?? [],
      onFile: edge
        ? {
            relationshipId: edge.id,
            professionalId: edge.subject_id,
            professionalName: proName.get(edge.subject_id) ?? "Professional",
            status: edge.status as RelationshipStatus,
          }
        : null,
      decision: decision.get(c.id) ?? null,
    };
  });

  return { items, total: items.length };
}

async function currentLenderEdge(admin: any, portfolioClientId: string) {
  const { data } = await admin
    .from("relationships")
    .select(REL_COLUMNS)
    .eq("relationship_type", "professional_homeowner_lender")
    .eq("object_type", "portfolio_client")
    .eq("object_id", portfolioClientId)
    .in("status", ["asserted", "confirmed"])
    .is("revoked_at", null);
  const rows = (data ?? []) as RelationshipRow[];
  return rows.find((r) => r.status === "confirmed") ?? rows[0] ?? null;
}

async function setReviewState(
  admin: any,
  args: {
    orgId: string;
    userId: string;
    portfolioClientId: string;
    decision: ReviewDecision;
    note?: string | null;
  },
): Promise<void> {
  await admin.from("home_team_review_state").upsert(
    {
      agent_org_id: args.orgId,
      portfolio_client_id: args.portfolioClientId,
      decision: args.decision,
      note: args.note ?? null,
      reviewed_by: args.userId,
      reviewed_at: new Date().toISOString(),
    },
    { onConflict: "agent_org_id,portfolio_client_id" },
  );
  await logNetworkEvent(admin, {
    action: "home_team_reviewed",
    actorUserId: args.userId,
    orgId: args.orgId,
    entityType: "portfolio_client",
    entityId: args.portfolioClientId,
    detail: args.decision,
    metadata: { decision: args.decision },
  });
}

/**
 * The agent names this client's lender.
 *
 * Produces exactly one active asserted edge. A homeowner-confirmed lender is
 * left completely untouched.
 */
export async function assignClientLender(
  admin: any,
  args: {
    orgId: string;
    userId: string;
    portfolioClientId: string;
    professionalId: string;
    candidateId?: string | null;
  },
): Promise<{ outcome: "assigned" | "unchanged" | "blocked_homeowner_confirmed" }> {
  const existing = await currentLenderEdge(admin, args.portfolioClientId);
  if (existing?.status === "confirmed") return { outcome: "blocked_homeowner_confirmed" };

  if (existing && existing.subject_id === args.professionalId) {
    await setReviewState(admin, { ...args, decision: "assigned" });
    return { outcome: "unchanged" };
  }

  if (existing) {
    // Only an agent assertion may be replaced, and it is rejected explicitly.
    await rejectRelationship(admin, existing.id, {
      rejectedBy: args.userId,
      reason: "Replaced by the agent with a different lender",
    });
  }

  await assertRelationship(
    admin,
    {
      type: "professional_homeowner_lender",
      subjectType: "professional",
      subjectId: args.professionalId,
      objectType: "portfolio_client",
      objectId: args.portfolioClientId,
      orgId: args.orgId,
    },
    {
      source: "agent_confirmation",
      assertedBy: args.userId,
      evidence: {
        assigned_by_agent: true,
        // Provenance only: a candidate may have informed the choice.
        home_team_candidate_id: args.candidateId ?? null,
      },
    },
  );

  await setReviewState(admin, { ...args, decision: "assigned" });
  return { outcome: "assigned" };
}

/**
 * "No current lender" or "I don't know".
 *
 * Neither writes a lender relationship, and neither touches provider evidence:
 * a candidate is only rejected when the agent rejects that suggestion by name.
 */
export async function recordReviewDecision(
  admin: any,
  args: {
    orgId: string;
    userId: string;
    portfolioClientId: string;
    decision: Extract<ReviewDecision, "no_lender" | "unknown">;
    note?: string | null;
  },
): Promise<{ outcome: "recorded" | "blocked_homeowner_confirmed" }> {
  if (args.decision === "no_lender") {
    const existing = await currentLenderEdge(admin, args.portfolioClientId);
    if (existing?.status === "confirmed") return { outcome: "blocked_homeowner_confirmed" };
  }
  await setReviewState(admin, args);
  return { outcome: "recorded" };
}

/** The agent says one specific suggestion is wrong. That candidate only. */
export async function rejectCandidateSuggestion(
  admin: any,
  args: { orgId: string; userId: string; candidateId: string },
): Promise<void> {
  const { data: row } = await admin
    .from("home_team_candidates")
    .select("id, portfolio_client_id, candidate_name, status")
    .eq("id", args.candidateId)
    .maybeSingle();
  if (!row) throw new Error("Suggestion not found");
  if (!(await clientBelongsToWorkspace(admin, args.orgId, row.portfolio_client_id))) {
    throw new Error("Forbidden");
  }

  await admin
    .from("home_team_candidates")
    .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: args.userId })
    .eq("id", args.candidateId);

  await logNetworkEvent(admin, {
    action: "home_team_candidate_rejected",
    actorUserId: args.userId,
    orgId: args.orgId,
    entityType: "home_team_candidate",
    entityId: args.candidateId,
    detail: row.candidate_name,
    metadata: { previous_status: row.status },
  });
}

/** Idempotent bulk apply with a per-client outcome; retries cannot duplicate edges. */
export async function bulkAssignClientLender(
  admin: any,
  args: {
    orgId: string;
    userId: string;
    professionalId: string;
    portfolioClientIds: string[];
  },
): Promise<BulkResult[]> {
  const allowed = new Set(await workspaceClientIds(admin, args.orgId));
  const results: BulkResult[] = [];

  for (const id of args.portfolioClientIds) {
    if (!allowed.has(id)) {
      results.push({ portfolioClientId: id, outcome: "not_in_workspace" });
      continue;
    }
    try {
      const r = await assignClientLender(admin, {
        orgId: args.orgId,
        userId: args.userId,
        portfolioClientId: id,
        professionalId: args.professionalId,
      });
      results.push({
        portfolioClientId: id,
        outcome: r.outcome,
        detail:
          r.outcome === "blocked_homeowner_confirmed"
            ? "A homeowner-confirmed lender is already on file"
            : undefined,
      });
    } catch (e: any) {
      results.push({ portfolioClientId: id, outcome: "error", detail: e?.message });
    }
  }
  return results;
}
