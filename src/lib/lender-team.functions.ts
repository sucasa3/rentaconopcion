import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { teamErrorMessage } from "./lender-team";

const uuid = z.string().uuid();

async function hashToken(token: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(token).digest("hex");
}
async function newToken(): Promise<string> {
  const { randomBytes } = await import("crypto");
  return randomBytes(32).toString("base64url");
}
function inviteUrl(token: string): string {
  const site = process.env["SITE_URL"] ?? "https://sucasa.com";
  return `${site}/team-invite?t=${encodeURIComponent(token)}`;
}
function rpcError(error: { message: string } | null) {
  if (error) throw new Error(teamErrorMessage(error.message));
}

/** Team roster, seats, invitations and suspended members for one lender org. */
export const getLenderTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: member } = await supabase
      .from("lender_members")
      .select("role")
      .eq("lender_org_id", data.orgId)
      .eq("user_id", userId)
      .maybeSingle();
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!member && !isAdmin) throw new Error("You do not have access to this organization");

    const { data: usageRows } = await supabase.rpc("lender_seat_usage", { _org_id: data.orgId });
    const usage = (usageRows as any)?.[0] ?? { active_members: 0, pending_invites: 0, seat_limit: 1, team_enabled: false };
    const { data: teamManager } = await supabase.rpc("lender_is_team_manager", { _user_id: userId, _org_id: data.orgId });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await supabaseAdmin
      .from("lender_orgs")
      .select("id, name, plan_key, pending_plan_key, pending_plan_effective_at, retained_member_ids")
      .eq("id", data.orgId)
      .maybeSingle();
    let pendingSeatLimit: number | null = null;
    if (org?.pending_plan_key) {
      const { data: p } = await supabaseAdmin.from("plan_tiers").select("seat_limit").eq("key", org.pending_plan_key).maybeSingle();
      pendingSeatLimit = p?.seat_limit ?? null;
    }

    const isManagerRole = isAdmin || ["owner", "admin", "manager"].includes((member as any)?.role ?? "");
    const { data: members } = await supabaseAdmin
      .from("lender_members")
      .select("user_id, role, created_at")
      .eq("lender_org_id", data.orgId)
      .order("created_at");
    const { data: suspended } = isManagerRole
      ? await supabaseAdmin
          .from("lender_suspended_members")
          .select("user_id, role, reason, suspended_at")
          .eq("lender_org_id", data.orgId)
      : { data: [] as any[] };
    const ids = [...(members ?? []), ...(suspended ?? [])].map((m: any) => m.user_id);
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] as any[] };
    const pm = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const label = (id: string) => pm.get(id)?.full_name || pm.get(id)?.email || "Team member";

    const { data: invites } = isManagerRole
      ? await supabase
          .from("lender_team_invitations")
          .select("id, email, role, status, expires_at, created_at")
          .eq("lender_org_id", data.orgId)
          .in("status", ["pending", "expired"])
          .order("created_at", { ascending: false })
      : { data: [] as any[] };

    return {
      orgId: data.orgId,
      orgName: org?.name ?? "",
      planKey: org?.plan_key ?? null,
      myRole: (member as any)?.role ?? (isAdmin ? "admin" : null),
      isTeamManager: Boolean(teamManager),
      teamEnabled: Boolean(usage.team_enabled),
      seatLimit: Number(usage.seat_limit ?? 1),
      activeMembers: Number(usage.active_members ?? 0),
      pendingInvites: Number(usage.pending_invites ?? 0),
      pendingPlanKey: org?.pending_plan_key ?? null,
      pendingPlanEffectiveAt: org?.pending_plan_effective_at ?? null,
      pendingSeatLimit,
      retainedMemberIds: (org?.retained_member_ids as string[] | null) ?? [],
      members: (members ?? []).map((m: any) => ({
        userId: m.user_id,
        role: m.role,
        name: label(m.user_id),
        email: pm.get(m.user_id)?.email ?? null,
        joinedAt: m.created_at,
        isMe: m.user_id === userId,
      })),
      suspended: (suspended ?? []).map((s: any) => ({
        userId: s.user_id,
        role: s.role,
        reason: s.reason,
        name: label(s.user_id),
        suspendedAt: s.suspended_at,
      })),
      invites: (invites ?? []).map((i: any) => ({
        ...i,
        expired: i.status === "expired" || new Date(i.expires_at).getTime() <= Date.now(),
      })),
    };
  });

/** Invite a loan officer. Reserves a seat atomically; returns a one-time link. */
export const inviteLoanOfficer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ orgId: uuid, email: z.string().trim().email().max(254), role: z.enum(["member", "manager"]).default("member") }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const token = await newToken();
    const { data: id, error } = await context.supabase.rpc("create_lender_team_invite", {
      _org_id: data.orgId,
      _email: data.email,
      _role: data.role,
      _token_hash: await hashToken(token),
    });
    rpcError(error);
    // Release 1: the manager shares the link; no email is sent automatically.
    return { id: id as string, url: inviteUrl(token) };
  });

export const resendLoanOfficerInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ inviteId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const token = await newToken();
    const { error } = await context.supabase.rpc("resend_lender_team_invite", {
      _invite_id: data.inviteId,
      _token_hash: await hashToken(token),
    });
    rpcError(error);
    return { url: inviteUrl(token) };
  });

export const cancelLoanOfficerInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ inviteId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_lender_team_invite", { _invite_id: data.inviteId });
    rpcError(error);
    return { ok: true };
  });

export const acceptLoanOfficerInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ token: z.string().min(20).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: orgId, error } = await context.supabase.rpc("accept_lender_team_invite", {
      _token_hash: await hashToken(data.token),
    });
    rpcError(error);
    if (!orgId) throw new Error("This invitation has expired. Ask your manager to resend it.");
    return { orgId: orgId as string };
  });

export const removeLoanOfficer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid, userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("remove_lender_member", { _org_id: data.orgId, _user_id: data.userId });
    rpcError(error);
    return { ok: true };
  });

export const reactivateLoanOfficer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid, userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reactivate_lender_member", { _org_id: data.orgId, _user_id: data.userId });
    rpcError(error);
    return { ok: true };
  });

export const setRetainedOfficers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid, userIds: z.array(uuid).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_lender_retained_members", { _org_id: data.orgId, _user_ids: data.userIds });
    rpcError(error);
    return { ok: true };
  });

/** Branch manager moves an agent relationship to another officer. */
export const reassignCollaboration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ connectionId: uuid, userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: conn } = await context.supabase
      .from("agent_lender_connections")
      .select("lender_org_id")
      .eq("id", data.connectionId)
      .maybeSingle();
    if (!conn) throw new Error("Not found");
    const { data: ok } = await context.supabase.rpc("lender_is_team_manager", { _user_id: context.userId, _org_id: conn.lender_org_id });
    if (!ok) throw new Error(teamErrorMessage("TEAM_FORBIDDEN"));
    const { data: target } = await context.supabase
      .from("lender_members")
      .select("user_id")
      .eq("lender_org_id", conn.lender_org_id)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!target) throw new Error("That person is not an active member of this branch");
    const { error } = await context.supabase
      .from("agent_lender_connections")
      .update({ owner_user_id: data.userId })
      .eq("id", data.connectionId);
    rpcError(error);
    return { ok: true };
  });
