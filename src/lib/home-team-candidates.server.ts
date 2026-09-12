/**
 * Unresolved Home Team evidence — server side.
 *
 * A CANDIDATE is provider or human evidence that MAY later become a real
 * relationship. It lives in `home_team_candidates` and is never a graph edge:
 * `relationships` rows are only written when BOTH sides of the edge are real
 * canonical entities (an existing organization, or a resolved professional).
 *
 * Candidate status is NOT an access basis. Named homeowner access stays with
 * `classifyLenderAccess()` + `consent_records` only.
 */
import type { HomeTeamCandidate, SuppressedCandidate } from "./home-team";
import { logNetworkEvent, logNetworkEvents } from "./network-events.server";
import {
  isAutoResolvable,
  normalizeOrgName,
  resolveOrganization,
  type OrgAlias,
  type OrgCandidate,
} from "./org-resolution";
import { upsertEvidenceRelationship } from "./relationships.server";

const COLUMNS =
  "id, portfolio_client_id, org_id, role, source, candidate_name, candidate_name_normalized, confidence, evidence, status, resolved_org_id, resolved_professional_id, resolved_relationship_id, reviewed_at, reviewed_by";

export interface HomeTeamCandidateRow {
  id: string;
  portfolio_client_id: string;
  org_id: string | null;
  role: string;
  source: string;
  candidate_name: string;
  candidate_name_normalized: string;
  confidence: number | null;
  evidence: Record<string, unknown> | null;
  status: "detected" | "suggested" | "resolved" | "rejected" | "suppressed";
  resolved_org_id: string | null;
  resolved_professional_id: string | null;
  resolved_relationship_id: string | null;
}

/** Narrow the organization set the resolver is allowed to consider. */
async function lookupOrganizations(
  admin: any,
  normalized: string,
): Promise<{ orgs: OrgCandidate[]; aliases: OrgAlias[] }> {
  const first = normalized.split(" ")[0] ?? "";
  if (first.length < 3) return { orgs: [], aliases: [] };
  const [{ data: orgs }, { data: aliases }] = await Promise.all([
    admin.from("lender_orgs").select("id, name").ilike("name", `%${first}%`).limit(50),
    admin
      .from("organization_aliases")
      .select("org_id, alias_normalized, trusted")
      .eq("alias_normalized", normalized)
      .limit(50),
  ]);
  return { orgs: (orgs ?? []) as OrgCandidate[], aliases: (aliases ?? []) as OrgAlias[] };
}

/**
 * Store detected institution evidence for one homeowner record.
 *
 * Every distinct institution is kept as its own candidate row. Suppressed noise
 * is recorded as an audit event and never written to the graph. No organization
 * is ever created from a provider string.
 */
export async function persistHomeTeamCandidates(
  admin: any,
  args: {
    portfolioClientId: string;
    orgId: string | null;
    candidates: HomeTeamCandidate[];
    suppressed: SuppressedCandidate[];
  },
): Promise<{ written: number; resolved: number; unresolved: number; suppressed: number }> {
  let written = 0;
  let resolved = 0;
  let unresolved = 0;

  for (const candidate of args.candidates) {
    const normalized = normalizeOrgName(candidate.name);
    if (!normalized) continue;

    const { data: existing } = await admin
      .from("home_team_candidates")
      .select(COLUMNS)
      .eq("portfolio_client_id", args.portfolioClientId)
      .eq("role", candidate.role)
      .eq("source", candidate.source)
      .eq("candidate_name_normalized", normalized)
      .maybeSingle();

    const evidence = {
      institution_name: candidate.name,
      institution_name_raw: candidate.rawName,
      ...candidate.evidence,
    };

    let row: HomeTeamCandidateRow;
    if (existing) {
      const prior = existing as HomeTeamCandidateRow;
      // Refresh evidence only; a human decision is never overwritten.
      const { data, error } = await admin
        .from("home_team_candidates")
        .update({ evidence: { ...(prior.evidence ?? {}), ...evidence }, confidence: candidate.confidence })
        .eq("id", prior.id)
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      row = data as HomeTeamCandidateRow;
    } else {
      const { data, error } = await admin
        .from("home_team_candidates")
        .insert({
          portfolio_client_id: args.portfolioClientId,
          org_id: args.orgId,
          role: candidate.role,
          source: candidate.source,
          candidate_name: candidate.name,
          candidate_name_normalized: normalized,
          confidence: candidate.confidence,
          evidence,
          status: "detected",
        })
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      row = data as HomeTeamCandidateRow;
      written += 1;
    }

    await logNetworkEvent(admin, {
      action: "home_team_candidate_detected",
      orgId: args.orgId,
      entityType: "home_team_candidate",
      entityId: row.id,
      detail: candidate.name,
      metadata: {
        role: candidate.role,
        source: candidate.source,
        lien_kind: candidate.evidence.lienKind,
        confidence: candidate.confidence,
        created: !existing,
      },
    });

    if (row.status === "detected" || row.status === "suggested") {
      const outcome = await tryResolveCandidateOrganization(admin, row);
      if (outcome === "resolved") resolved += 1;
      else unresolved += 1;
    }
  }

  await logNetworkEvents(
    admin,
    args.suppressed.map((s) => ({
      action: "home_team_candidate_suppressed" as const,
      orgId: args.orgId,
      entityType: "portfolio_client",
      entityId: args.portfolioClientId,
      detail: s.reason,
      metadata: { reason: s.reason, raw_name: s.rawName },
    })),
  );

  return { written, resolved, unresolved, suppressed: args.suppressed.length };
}

/**
 * Try to turn one candidate into a real edge.
 *
 * Only an exact normalized legal-name match or a trusted alias links
 * automatically. Anything else is surfaced for human review as `suggested`.
 */
export async function tryResolveCandidateOrganization(
  admin: any,
  row: HomeTeamCandidateRow,
): Promise<"resolved" | "needs_review"> {
  const { orgs, aliases } = await lookupOrganizations(admin, row.candidate_name_normalized);
  const resolution = resolveOrganization(row.candidate_name, orgs, aliases);

  if (isAutoResolvable(resolution.outcome) && resolution.orgId) {
    // Both sides are canonical now: the organization and the homeowner record.
    const { row: edge } = await upsertEvidenceRelationship(
      admin,
      {
        type: "organization_homeowner",
        subjectType: "organization",
        subjectId: resolution.orgId,
        objectType: "portfolio_client",
        objectId: row.portfolio_client_id,
        orgId: row.org_id,
      },
      {
        source: "batchdata_mortgage",
        status: "detected",
        confidence: row.confidence,
        evidence: {
          ...(row.evidence ?? {}),
          resolution_outcome: resolution.outcome,
          home_team_candidate_id: row.id,
        },
      },
    );

    await admin
      .from("home_team_candidates")
      .update({
        status: "resolved",
        resolved_org_id: resolution.orgId,
        resolved_relationship_id: edge.id,
      })
      .eq("id", row.id);

    await logNetworkEvent(admin, {
      action: "home_team_candidate_resolved",
      orgId: row.org_id,
      entityType: "home_team_candidate",
      entityId: row.id,
      detail: `Resolved by ${resolution.outcome}`,
      metadata: { outcome: resolution.outcome, org_id: resolution.orgId, relationship_id: edge.id },
    });
    return "resolved";
  }

  if (row.status !== "suggested") {
    await admin.from("home_team_candidates").update({ status: "suggested" }).eq("id", row.id);
  }
  await logNetworkEvent(admin, {
    action: "home_team_candidate_suggested",
    orgId: row.org_id,
    entityType: "home_team_candidate",
    entityId: row.id,
    detail: row.candidate_name,
    metadata: {
      outcome: resolution.outcome,
      candidate_org_ids: resolution.candidateOrgIds,
    },
  });
  return "needs_review";
}
