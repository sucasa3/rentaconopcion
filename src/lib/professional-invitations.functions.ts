/**
 * Professional invitations + homeowner validation — server function boundary.
 *
 * Authorization is proven here, never assumed from the client:
 *  - agent actions require membership of the named agent workspace
 *  - the public landing page returns only invitation metadata
 *  - claiming requires a signed-in user whose email the auth provider itself
 *    confirmed, matching the invited address
 *  - homeowner answers are scoped to the signed-in homeowner's own records
 *
 * None of these functions can grant homeowner data access. That remains
 * `classifyLenderAccess()` + `consent_records`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { invitationDisplayState, mayResend } from "./professional-invitations";

const uuid = z.string().uuid();
const tokenInput = z.object({ token: z.string().min(10).max(2048) });

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Membership of an agent-type organization, checked with the caller's own RLS. */
async function requireAgentOrg(supabase: any, userId: string, orgId: string): Promise<void> {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: org } = await supabase
    .from("lender_orgs")
    .select("id, org_type")
    .eq("id", orgId)
    .maybeSingle();
  if (!org || org.org_type !== "agent") throw new Error("Forbidden: agent workspace required");
  if (isAdmin) return;
  const { data: member } = await supabase
    .from("lender_members")
    .select("user_id")
    .eq("lender_org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) throw new Error("Forbidden: you are not a member of this workspace");
}

/** Invitation state per professional, for the Professional Network list. */
export const listProfessionalInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ orgId: uuid, professionalIds: z.array(uuid).max(500) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAgentOrg(context.supabase, context.userId, data.orgId);
    const db = await admin();
    const { latestInvitations } = await import("./professional-invitations.server");
    const rows = await latestInvitations(db, data.orgId, data.professionalIds);

    const { data: pros } = await db
      .from("professionals")
      .select("id, claim_status, email_normalized")
      .in("id", data.professionalIds.length ? data.professionalIds : ["00000000-0000-0000-0000-000000000000"]);

    const states = (pros ?? []).map((p: any) => {
      const row = rows.get(p.id) ?? null;
      const state = invitationDisplayState(row, { claim_status: p.claim_status });
      return {
        professionalId: p.id as string,
        state,
        canResend: mayResend(state),
        invitationId: row?.id ?? null,
        hasEmail: Boolean(p.email_normalized),
      };
    });
    return { states };
  });

export const inviteProfessionalToSucasa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ orgId: uuid, professionalId: uuid, resend: z.boolean().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAgentOrg(context.supabase, context.userId, data.orgId);
    const { inviteProfessional } = await import("./professional-invitations.server");
    const res = await inviteProfessional(await admin(), {
      orgId: data.orgId,
      userId: context.userId,
      professionalId: data.professionalId,
      resend: data.resend ?? false,
    });
    if (res.outcome === "already_on_sucasa") return { outcome: "already_on_sucasa" as const };
    if (res.outcome === "no_email") return { outcome: "no_email" as const };
    return { outcome: res.outcome, delivered: res.delivered };
  });

export const revokeProfessionalInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid, invitationId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAgentOrg(context.supabase, context.userId, data.orgId);
    const { revokeInvitation } = await import("./professional-invitations.server");
    await revokeInvitation(await admin(), {
      orgId: data.orgId,
      userId: context.userId,
      invitationId: data.invitationId,
    });
    return { ok: true as const };
  });

/**
 * Public landing preview. Server-mediated on purpose: the invitation tables
 * stay closed to anonymous readers, and this returns no homeowner, property or
 * mortgage information of any kind.
 */
export const previewProfessionalInvite = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenInput.parse(i))
  .handler(async ({ data }) => {
    const { previewInvitation } = await import("./professional-invitations.server");
    return previewInvitation(await admin(), data.token);
  });

/**
 * Accept and claim. Requires an authenticated user whose email address the auth
 * provider has confirmed and which matches the invited address; claiming
 * verifies that one channel only.
 */
export const acceptProfessionalInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => tokenInput.parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    // Trust the auth provider's own record, not a client claim.
    const { data: authUser } = await db.auth.admin.getUserById(context.userId);
    const email = authUser?.user?.email ?? null;
    const verified = Boolean(authUser?.user?.email_confirmed_at);

    const { acceptInvitation } = await import("./professional-invitations.server");
    return acceptInvitation(db, {
      token: data.token,
      authUserId: context.userId,
      authEmail: email,
      authEmailVerified: verified,
    });
  });

export const declineProfessionalInvite = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenInput.parse(i))
  .handler(async ({ data }) => {
    const { declineInvitation } = await import("./professional-invitations.server");
    return declineInvitation(await admin(), { token: data.token, authUserId: null });
  });

// --- Homeowner side --------------------------------------------------------

export const listMyHomeTeamValidations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { pendingValidations } = await import("./professional-invitations.server");
    const pending = await pendingValidations(await admin(), context.userId);
    return { pending };
  });

/** Step A — relationship truth. Answering "yes" shares nothing. */
export const submitHomeTeamValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        relationshipId: uuid,
        answer: z.enum(["yes", "no", "not_sure"]),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { recordHomeownerValidation } = await import("./professional-invitations.server");
    return recordHomeownerValidation(await admin(), {
      homeownerId: context.userId,
      relationshipId: data.relationshipId,
      answer: data.answer,
      note: data.note ?? null,
    });
  });

/** Step B — the separate, opt-in decision to share. */
export const submitHomeTeamConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        relationshipId: uuid,
        connect: z.boolean(),
        scopes: z.array(z.string().max(40)).max(10).default([]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { recordConnectionChoice } = await import("./professional-invitations.server");
    return recordConnectionChoice(await admin(), {
      homeownerId: context.userId,
      relationshipId: data.relationshipId,
      connect: data.connect,
      scopes: data.scopes,
    });
  });
