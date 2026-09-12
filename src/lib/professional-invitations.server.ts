/**
 * Professional invitations + homeowner relationship validation — server side.
 *
 * Callers arrive here already authorized. The invariants this module keeps:
 *  - ONE live invitation per inviter workspace + professional + context. Twelve
 *    asserted homeowner relationships to the same loan officer are still one
 *    invitation, and the relationship rows stay separate.
 *  - Invitation state never touches relationship state, and vice versa.
 *  - Nothing here grants homeowner access. Access remains
 *    `classifyLenderAccess()` + `consent_records`, and the homeowner's
 *    "yes, that's my lender" is deliberately not a permission.
 */
import {
  decideClaim,
  isActiveInvitation,
  isExpired,
  type ClaimDecision,
  type InvitationRow,
  type ValidationAnswer,
  claimVerificationPatch,
  connectionConsent,
  validationEffect,
} from "./professional-invitations";
import { logNetworkEvent } from "./network-events.server";
import { signTypedInviteToken, verifyTypedInviteToken } from "./invite-token.server";
import { confirmRelationship, rejectRelationship } from "./relationships.server";

const COLUMNS =
  "id, invitation_context, inviter_org_id, invited_professional_id, invited_email_normalized, related_resource_relationship_id, status, sent_at, last_sent_at, send_count, accepted_at, accepted_by_user_id, declined_at, revoked_at, expires_at";

const CONTEXT = "agent_invites_professional" as const;
const TTL_DAYS = 21;

function expiryFromNow(): string {
  return new Date(Date.now() + TTL_DAYS * 24 * 3600 * 1000).toISOString();
}

export function invitationLink(invitation: { id: string; invited_email_normalized: string }): string {
  const token = signTypedInviteToken({
    invitationId: invitation.id,
    context: CONTEXT,
    email: invitation.invited_email_normalized,
  });
  const base = process.env["PUBLIC_SITE_URL"] ?? "https://rentaconopcion.lovable.app";
  return `${base}/professional-invite?t=${encodeURIComponent(token)}`;
}

async function liveInvitation(
  admin: any,
  orgId: string,
  professionalId: string,
): Promise<InvitationRow | null> {
  const { data } = await admin
    .from("professional_invitations")
    .select(COLUMNS)
    .eq("inviter_org_id", orgId)
    .eq("invited_professional_id", professionalId)
    .eq("invitation_context", CONTEXT)
    .in("status", ["pending", "sent"])
    .maybeSingle();
  const row = (data ?? null) as InvitationRow | null;
  return row;
}

export async function latestInvitations(
  admin: any,
  orgId: string,
  professionalIds: string[],
): Promise<Map<string, InvitationRow>> {
  if (!professionalIds.length) return new Map();
  const { data } = await admin
    .from("professional_invitations")
    .select(COLUMNS)
    .eq("inviter_org_id", orgId)
    .in("invited_professional_id", professionalIds)
    .order("created_at", { ascending: false });
  const out = new Map<string, InvitationRow>();
  for (const row of (data ?? []) as InvitationRow[]) {
    if (!out.has(row.invited_professional_id)) out.set(row.invited_professional_id, row);
  }
  return out;
}

export type InviteOutcome =
  | { outcome: "created" | "resent"; invitation: InvitationRow; delivered: boolean }
  | { outcome: "already_on_sucasa" }
  | { outcome: "no_email" };

/**
 * Invite the professional this workspace works with.
 *
 * Re-running it reuses the live invitation instead of sending a second email;
 * an expired one is superseded rather than duplicated.
 */
export async function inviteProfessional(
  admin: any,
  args: { orgId: string; userId: string; professionalId: string; resend?: boolean },
): Promise<InviteOutcome> {
  const { data: pro } = await admin
    .from("professionals")
    .select("id, full_name, email_normalized, claim_status, user_id")
    .eq("id", args.professionalId)
    .maybeSingle();
  if (!pro) throw new Error("Professional not found");
  if (pro.claim_status === "claimed" || pro.user_id) return { outcome: "already_on_sucasa" };

  // The workspace's own edge may hold the address the agent actually knows.
  const { data: edge } = await admin
    .from("relationships")
    .select("id, evidence")
    .eq("relationship_type", "agent_professional_resource")
    .eq("subject_id", args.orgId)
    .eq("object_id", args.professionalId)
    .maybeSingle();
  const workspaceEmail = (edge?.evidence as any)?.["workspace_email"] as string | undefined;
  const email = (workspaceEmail || pro.email_normalized || "").trim().toLowerCase();
  if (!email) return { outcome: "no_email" };

  let row = await liveInvitation(admin, args.orgId, args.professionalId);
  let outcome: "created" | "resent" = "resent";

  if (row && isExpired(row)) {
    // Supersede rather than accumulate: the unique index allows one live row.
    await admin
      .from("professional_invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", row.id);
    row = null;
  }

  if (!row) {
    const { data, error } = await admin
      .from("professional_invitations")
      .insert({
        invitation_context: CONTEXT,
        inviter_org_id: args.orgId,
        invited_professional_id: args.professionalId,
        invited_email_normalized: email,
        related_resource_relationship_id: edge?.id ?? null,
        status: "pending",
        created_by: args.userId,
        expires_at: expiryFromNow(),
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    row = data as InvitationRow;
    outcome = "created";
    await logNetworkEvent(admin, {
      action: "professional_invitation_created",
      actorUserId: args.userId,
      orgId: args.orgId,
      entityType: "professional_invitation",
      entityId: row.id,
      metadata: { context: CONTEXT, professional_id: args.professionalId },
    });
  } else if (!args.resend) {
    // Already invited and still live: never a second email.
    return { outcome: "resent", invitation: row, delivered: false };
  }

  const delivered = await deliverInvitation(admin, {
    invitation: row,
    orgId: args.orgId,
    userId: args.userId,
    professionalName: pro.full_name as string,
    resend: outcome === "resent",
  });

  const { data: refreshed } = await admin
    .from("professional_invitations")
    .select(COLUMNS)
    .eq("id", row.id)
    .maybeSingle();

  return { outcome, invitation: (refreshed ?? row) as InvitationRow, delivered };
}

/**
 * Delivery is persistence-first: the ledger is authoritative, and a mail
 * failure never loses the invitation.
 */
async function deliverInvitation(
  admin: any,
  args: {
    invitation: InvitationRow;
    orgId: string;
    userId: string;
    professionalName: string;
    resend: boolean;
  },
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: org } = await admin
    .from("lender_orgs")
    .select("name")
    .eq("id", args.orgId)
    .maybeSingle();

  let delivered = false;
  try {
    const { sendTemplateEmail } = await import("./email-templates/send-email");
    const res = await sendTemplateEmail(
      "professional-invite",
      args.invitation.invited_email_normalized,
      {
        // Deliberately relationship-only: no homeowner names, addresses,
        // property facts, mortgage details or counts of "clients".
        templateData: {
          professionalName: args.professionalName,
          inviterOrgName: (org?.name as string | null) ?? "An agent on SuCasa",
          acceptUrl: invitationLink(args.invitation),
        },
        idempotencyKey: `pro-invite:${args.invitation.id}:${args.invitation.send_count + 1}`,
      },
    );
    delivered = res.sent;
  } catch {
    delivered = false;
  }

  await admin
    .from("professional_invitations")
    .update({
      status: "sent",
      sent_at: args.invitation.sent_at ?? now,
      last_sent_at: now,
      send_count: (args.invitation.send_count ?? 0) + 1,
    })
    .eq("id", args.invitation.id);

  await logNetworkEvent(admin, {
    action: args.resend ? "professional_invitation_resent" : "professional_invitation_sent",
    actorUserId: args.userId,
    orgId: args.orgId,
    entityType: "professional_invitation",
    entityId: args.invitation.id,
    metadata: { delivered, send_count: (args.invitation.send_count ?? 0) + 1 },
  });
  return delivered;
}

export async function revokeInvitation(
  admin: any,
  args: { orgId: string; userId: string; invitationId: string },
): Promise<void> {
  const { data: row } = await admin
    .from("professional_invitations")
    .select(COLUMNS)
    .eq("id", args.invitationId)
    .eq("inviter_org_id", args.orgId)
    .maybeSingle();
  if (!row) throw new Error("Invitation not found");
  if (row.status === "accepted") throw new Error("This invitation was already accepted");

  await admin
    .from("professional_invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", args.invitationId);

  // The relationship edge is deliberately untouched.
  await logNetworkEvent(admin, {
    action: "professional_invitation_revoked",
    actorUserId: args.userId,
    orgId: args.orgId,
    entityType: "professional_invitation",
    entityId: args.invitationId,
  });
}

// ---------------------------------------------------------------------------
// Public landing (pre-authentication)
// ---------------------------------------------------------------------------

export type InvitationPreview =
  | { valid: false; reason: string }
  | {
      valid: true;
      inviterOrgName: string;
      invitedName: string | null;
      invitedEmail: string;
      alreadyAccepted: boolean;
    };

/**
 * Everything the public page may know.
 *
 * Signature first, then the live row, then a context/email cross-check. The
 * response carries no homeowner, property, mortgage or opportunity data of any
 * kind — only who is inviting and which address was invited.
 */
export async function previewInvitation(admin: any, token: string): Promise<InvitationPreview> {
  const parsed = verifyTypedInviteToken(token);
  if (!parsed.ok) return { valid: false, reason: parsed.reason };

  const { data: row } = await admin
    .from("professional_invitations")
    .select(COLUMNS)
    .eq("id", parsed.claims.invitationId)
    .maybeSingle();
  if (!row) return { valid: false, reason: "invalid" };

  const inv = row as InvitationRow;
  if (
    inv.invitation_context !== parsed.claims.context ||
    inv.invited_email_normalized !== parsed.claims.email
  ) {
    return { valid: false, reason: "invalid" };
  }
  if (inv.status === "revoked") return { valid: false, reason: "revoked" };
  if (inv.status === "declined") return { valid: false, reason: "declined" };
  if (inv.status !== "accepted" && !isActiveInvitation(inv)) {
    return { valid: false, reason: "expired" };
  }

  const [{ data: org }, { data: pro }] = await Promise.all([
    admin.from("lender_orgs").select("name").eq("id", inv.inviter_org_id).maybeSingle(),
    admin
      .from("professionals")
      .select("full_name")
      .eq("id", inv.invited_professional_id)
      .maybeSingle(),
  ]);

  return {
    valid: true,
    inviterOrgName: (org?.name as string | null) ?? "An agent on SuCasa",
    invitedName: (pro?.full_name as string | null) ?? null,
    invitedEmail: inv.invited_email_normalized,
    alreadyAccepted: inv.status === "accepted",
  };
}

// ---------------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------------

export type AcceptResult =
  | { outcome: "claimed" | "already_claimed_by_you"; professionalId: string }
  | { outcome: "wrong_account"; invitedEmail: string }
  | { outcome: "email_not_verified"; invitedEmail: string }
  | { outcome: "invitation_unavailable"; state: string }
  | { outcome: "reconciliation_required"; why: string };

export async function acceptInvitation(
  admin: any,
  args: {
    token: string;
    authUserId: string;
    authEmail: string | null;
    authEmailVerified: boolean;
  },
): Promise<AcceptResult> {
  const parsed = verifyTypedInviteToken(args.token);
  if (!parsed.ok) return { outcome: "invitation_unavailable", state: parsed.reason };

  const { data: row } = await admin
    .from("professional_invitations")
    .select(COLUMNS)
    .eq("id", parsed.claims.invitationId)
    .maybeSingle();
  if (!row) return { outcome: "invitation_unavailable", state: "invalid" };
  const inv = row as InvitationRow;
  if (
    inv.invitation_context !== parsed.claims.context ||
    inv.invited_email_normalized !== parsed.claims.email
  ) {
    return { outcome: "invitation_unavailable", state: "invalid" };
  }

  const [{ data: pro }, { data: mine }] = await Promise.all([
    admin
      .from("professionals")
      .select("id, user_id, claim_status")
      .eq("id", inv.invited_professional_id)
      .maybeSingle(),
    admin.from("professionals").select("id").eq("user_id", args.authUserId).maybeSingle(),
  ]);
  if (!pro) return { outcome: "invitation_unavailable", state: "invalid" };

  const decision: ClaimDecision = decideClaim({
    invitation: inv,
    authUserId: args.authUserId,
    authEmail: args.authEmail,
    authEmailVerified: args.authEmailVerified,
    professionalUserId: (pro.user_id as string | null) ?? null,
    usersOtherProfessionalId: (mine?.id as string | null) ?? null,
  });

  if (decision.outcome === "reconciliation_required") {
    await logNetworkEvent(admin, {
      action: "professional_identity_reconciliation_required",
      actorUserId: args.authUserId,
      orgId: inv.inviter_org_id,
      entityType: "professional",
      entityId: inv.invited_professional_id,
      metadata: { why: decision.why, invitation_id: inv.id },
    });
    return { outcome: "reconciliation_required", why: decision.why };
  }
  if (decision.outcome === "wrong_account" || decision.outcome === "email_not_verified") {
    return { outcome: decision.outcome, invitedEmail: decision.invitedEmail };
  }
  if (decision.outcome === "invitation_unavailable") {
    return { outcome: "invitation_unavailable", state: decision.state };
  }
  if (decision.outcome === "already_claimed_by_you") {
    return { outcome: "already_claimed_by_you", professionalId: decision.professionalId };
  }

  // Only the email actually signed in and verified becomes a verified fact.
  await admin
    .from("professionals")
    .update({
      user_id: args.authUserId,
      ...claimVerificationPatch(),
      email_normalized: inv.invited_email_normalized,
    })
    .eq("id", decision.professionalId);

  await admin
    .from("professional_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by_user_id: args.authUserId,
    })
    .eq("id", inv.id);

  await logNetworkEvent(admin, {
    action: "professional_invitation_accepted",
    actorUserId: args.authUserId,
    orgId: inv.inviter_org_id,
    entityType: "professional_invitation",
    entityId: inv.id,
  });
  await logNetworkEvent(admin, {
    action: "professional_identity_claimed",
    actorUserId: args.authUserId,
    orgId: inv.inviter_org_id,
    entityType: "professional",
    entityId: decision.professionalId,
    metadata: { verified_channel: "email" },
  });

  // Relationship edges are untouched: claiming an identity is not access.
  return { outcome: "claimed", professionalId: decision.professionalId };
}

export async function declineInvitation(
  admin: any,
  args: { token: string; authUserId: string | null },
): Promise<{ ok: boolean }> {
  const parsed = verifyTypedInviteToken(args.token);
  if (!parsed.ok) return { ok: false };
  const { data: row } = await admin
    .from("professional_invitations")
    .select(COLUMNS)
    .eq("id", parsed.claims.invitationId)
    .maybeSingle();
  if (!row || !isActiveInvitation(row as InvitationRow)) return { ok: false };

  await admin
    .from("professional_invitations")
    .update({ status: "declined", declined_at: new Date().toISOString() })
    .eq("id", (row as InvitationRow).id);
  await logNetworkEvent(admin, {
    action: "professional_invitation_declined",
    actorUserId: args.authUserId,
    orgId: (row as InvitationRow).inviter_org_id,
    entityType: "professional_invitation",
    entityId: (row as InvitationRow).id,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Homeowner validation
// ---------------------------------------------------------------------------

export interface PendingValidation {
  relationshipId: string;
  professionalId: string;
  professionalName: string;
  professionalOrg: string | null;
  askedBy: string | null;
}

/** Asserted lenders awaiting this homeowner's own answer. */
export async function pendingValidations(
  admin: any,
  homeownerId: string,
): Promise<PendingValidation[]> {
  const { data: clients } = await admin
    .from("lender_portfolio_clients")
    .select("id")
    .eq("homeowner_id", homeownerId)
    .is("archived_at", null);
  const clientIds = (clients ?? []).map((c: any) => c.id);
  if (!clientIds.length) return [];

  const { data: edges } = await admin
    .from("relationships")
    .select("id, subject_id, org_id, status")
    .eq("relationship_type", "professional_homeowner_lender")
    .eq("object_type", "portfolio_client")
    .in("object_id", clientIds)
    .eq("status", "asserted")
    .is("revoked_at", null);
  const rows = (edges ?? []) as any[];
  if (!rows.length) return [];

  const { data: answered } = await admin
    .from("homeowner_relationship_validations")
    .select("relationship_id")
    .eq("homeowner_id", homeownerId)
    .in(
      "relationship_id",
      rows.map((r) => r.id),
    );
  const done = new Set((answered ?? []).map((a: any) => a.relationship_id));

  const proIds = [...new Set(rows.map((r) => r.subject_id))];
  const { data: pros } = await admin
    .from("professionals")
    .select("id, full_name, org_name_raw")
    .in("id", proIds);
  const byId = new Map((pros ?? []).map((p: any) => [p.id, p]));

  const out: PendingValidation[] = [];
  for (const r of rows) {
    if (done.has(r.id)) continue;
    const p = byId.get(r.subject_id);
    if (!p) continue;
    out.push({
      relationshipId: r.id,
      professionalId: r.subject_id,
      professionalName: p.full_name,
      professionalOrg: p.org_name_raw ?? null,
      askedBy: r.org_id ?? null,
    });
  }
  if (out.length) {
    await logNetworkEvent(admin, {
      action: "homeowner_validation_requested",
      actorUserId: homeownerId,
      entityType: "homeowner",
      entityId: homeownerId,
      metadata: { pending: out.length },
    });
  }
  return out;
}

/**
 * Step A — relationship truth only.
 *
 * "Yes" confirms the relationship and grants NOTHING: the classifier still sees
 * no permission until the homeowner separately connects. "No" rejects the edge
 * while keeping its provenance. "Not sure" records the answer and leaves the
 * relationship exactly where it was.
 */
export async function recordHomeownerValidation(
  admin: any,
  args: {
    homeownerId: string;
    relationshipId: string;
    answer: ValidationAnswer;
    note?: string | null;
  },
): Promise<{ recorded: string; relationship: string; offerConnection: boolean }> {
  const { data: rel } = await admin
    .from("relationships")
    .select("id, subject_id, object_id, object_type, org_id, status")
    .eq("id", args.relationshipId)
    .maybeSingle();
  if (!rel) throw new Error("Relationship not found");

  // Only the homeowner this edge is about may answer for it.
  const { data: owns } = await admin
    .from("lender_portfolio_clients")
    .select("id")
    .eq("id", rel.object_id)
    .eq("homeowner_id", args.homeownerId)
    .maybeSingle();
  if (!owns) throw new Error("Forbidden");

  const effect = validationEffect(args.answer);

  if (effect.relationship === "confirm") {
    await confirmRelationship(admin, args.relationshipId, {
      source: "homeowner_confirmation",
      confirmedBy: args.homeownerId,
      evidence: { homeowner_confirmed: true, grants_access: false },
    });
    await logNetworkEvent(admin, {
      action: "homeowner_relationship_confirmed",
      actorUserId: args.homeownerId,
      orgId: rel.org_id ?? null,
      entityType: "relationship",
      entityId: args.relationshipId,
      metadata: { grants_access: false },
    });
  } else if (effect.relationship === "reject") {
    await rejectRelationship(admin, args.relationshipId, {
      rejectedBy: args.homeownerId,
      reason: "Homeowner says this is not their lender",
    });
    await logNetworkEvent(admin, {
      action: "homeowner_relationship_rejected",
      actorUserId: args.homeownerId,
      orgId: rel.org_id ?? null,
      entityType: "relationship",
      entityId: args.relationshipId,
    });
  } else {
    await logNetworkEvent(admin, {
      action: "homeowner_relationship_unknown",
      actorUserId: args.homeownerId,
      orgId: rel.org_id ?? null,
      entityType: "relationship",
      entityId: args.relationshipId,
    });
  }

  await admin.from("homeowner_relationship_validations").upsert(
    {
      homeowner_id: args.homeownerId,
      relationship_id: args.relationshipId,
      outcome: effect.recorded,
      note: args.note ?? null,
      responded_at: new Date().toISOString(),
    },
    { onConflict: "homeowner_id,relationship_id" },
  );

  return {
    recorded: effect.recorded,
    relationship: effect.relationship,
    offerConnection: effect.offerConnection,
  };
}

/**
 * Step B — the separate, opt-in connection.
 *
 * This is the ONLY step that can create a permission, it records exactly the
 * scopes the homeowner selected, and declining writes no consent at all.
 */
export async function recordConnectionChoice(
  admin: any,
  args: {
    homeownerId: string;
    relationshipId: string;
    connect: boolean;
    scopes: string[];
  },
): Promise<{ granted: boolean; scopes: string[]; consentId: string | null }> {
  const { data: rel } = await admin
    .from("relationships")
    .select("id, subject_id, object_id, org_id, status")
    .eq("id", args.relationshipId)
    .maybeSingle();
  if (!rel) throw new Error("Relationship not found");
  const { data: owns } = await admin
    .from("lender_portfolio_clients")
    .select("id")
    .eq("id", rel.object_id)
    .eq("homeowner_id", args.homeownerId)
    .maybeSingle();
  if (!owns) throw new Error("Forbidden");

  const choice = connectionConsent({ connect: args.connect, scopes: args.scopes });
  if (!choice.grant) {
    await logNetworkEvent(admin, {
      action: "homeowner_connection_declined",
      actorUserId: args.homeownerId,
      orgId: rel.org_id ?? null,
      entityType: "relationship",
      entityId: args.relationshipId,
    });
    return { granted: false, scopes: [], consentId: null };
  }

  const { data: pro } = await admin
    .from("professionals")
    .select("org_id")
    .eq("id", rel.subject_id)
    .maybeSingle();
  const recipientOrgId = (pro?.org_id as string | null) ?? null;
  if (!recipientOrgId) {
    // No canonical organization to hold the consent yet: record nothing rather
    // than invent a recipient.
    return { granted: false, scopes: [], consentId: null };
  }

  const { data: consent, error } = await admin
    .from("consent_records")
    .insert({
      homeowner_id: args.homeownerId,
      recipient_org_id: recipientOrgId,
      recipient_kind: "lender",
      consent_type: choice.consentType,
      scope: choice.scopes,
      source: "homeowner_action",
      context: { relationship_id: args.relationshipId, via: "home_team_validation" },
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await admin
    .from("relationships")
    .update({ consent_record_id: consent.id })
    .eq("id", args.relationshipId);

  await logNetworkEvent(admin, {
    action: "homeowner_connection_granted",
    actorUserId: args.homeownerId,
    orgId: rel.org_id ?? null,
    entityType: "consent_records",
    entityId: consent.id,
    metadata: { scopes: choice.scopes, relationship_id: args.relationshipId },
  });

  return { granted: true, scopes: choice.scopes, consentId: consent.id as string };
}
