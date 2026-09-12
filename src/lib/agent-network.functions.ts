/**
 * Agent Professional Network + Home Team review — authenticated server layer.
 *
 * Every function proves, server side: the caller is signed in, the caller is a
 * member of the agent organization it names, and every record it touches
 * belongs to that organization. A client-supplied `orgId` is never trusted on
 * its own.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { orderReviewQueue, rankProfessionals, reviewProgress } from "./agent-network";

const uuid = z.string().uuid();

/** Membership in an agent-type organization, checked with the caller's own RLS. */
async function requireAgentOrg(supabase: any, userId: string, orgId: string): Promise<void> {
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
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

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listMyProfessionalNetwork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ orgId: uuid, query: z.string().max(120).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAgentOrg(context.supabase, context.userId, data.orgId);
    const { listAgentProfessionalNetwork } = await import("./agent-network.server");
    const people = await listAgentProfessionalNetwork(await admin(), data.orgId);
    return { people: rankProfessionals(people, { query: data.query }) };
  });

export const addProfessionalToNetwork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orgId: uuid,
        fullName: z.string().min(2).max(120),
        orgNameRaw: z.string().max(160).optional().nullable(),
        email: z.string().max(160).optional().nullable(),
        phone: z.string().max(40).optional().nullable(),
        nmlsId: z.string().max(40).optional().nullable(),
        role: z.enum(["loan_officer", "closing_professional"]).default("loan_officer"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAgentOrg(context.supabase, context.userId, data.orgId);
    const { addAgentProfessional } = await import("./agent-network.server");
    return addAgentProfessional(await admin(), {
      orgId: data.orgId,
      userId: context.userId,
      input: {
        fullName: data.fullName,
        orgNameRaw: data.orgNameRaw ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        nmlsId: data.nmlsId ?? null,
        roles: [data.role],
      },
    });
  });

export const updateNetworkProfessional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orgId: uuid,
        professionalId: uuid,
        fullName: z.string().min(2).max(120).optional(),
        orgNameRaw: z.string().max(160).optional().nullable(),
        email: z.string().max(160).optional().nullable(),
        phone: z.string().max(40).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAgentOrg(context.supabase, context.userId, data.orgId);
    const { updateAgentProfessional } = await import("./agent-network.server");
    await updateAgentProfessional(await admin(), { ...data, userId: context.userId });
    return { ok: true };
  });

export const listHomeTeamReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAgentOrg(context.supabase, context.userId, data.orgId);
    const { listHomeTeamQueue } = await import("./agent-network.server");
    const { items, total } = await listHomeTeamQueue(await admin(), data.orgId);
    return {
      items: orderReviewQueue(items),
      progress: reviewProgress(
        items.map((i) => ({ decision: i.decision })),
        total,
      ),
    };
  });

async function requireClient(supabase: any, orgId: string, portfolioClientId: string) {
  const { clientBelongsToWorkspace } = await import("./agent-network.server");
  if (!(await clientBelongsToWorkspace(await admin(), orgId, portfolioClientId))) {
    throw new Error("Forbidden: that client is not in this workspace");
  }
  void supabase;
}

export const setClientLender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orgId: uuid,
        portfolioClientId: uuid,
        professionalId: uuid,
        candidateId: uuid.optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAgentOrg(context.supabase, context.userId, data.orgId);
    await requireClient(context.supabase, data.orgId, data.portfolioClientId);
    const { assignClientLender } = await import("./agent-network.server");
    return assignClientLender(await admin(), { ...data, userId: context.userId });
  });

export const setHomeTeamDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orgId: uuid,
        portfolioClientId: uuid,
        decision: z.enum(["no_lender", "unknown"]),
        note: z.string().max(300).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAgentOrg(context.supabase, context.userId, data.orgId);
    await requireClient(context.supabase, data.orgId, data.portfolioClientId);
    const { recordReviewDecision } = await import("./agent-network.server");
    return recordReviewDecision(await admin(), { ...data, userId: context.userId });
  });

export const rejectHomeTeamSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid, candidateId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAgentOrg(context.supabase, context.userId, data.orgId);
    const { rejectCandidateSuggestion } = await import("./agent-network.server");
    await rejectCandidateSuggestion(await admin(), { ...data, userId: context.userId });
    return { ok: true };
  });

export const bulkSetClientLender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orgId: uuid,
        professionalId: uuid,
        portfolioClientIds: z.array(uuid).min(1).max(200),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAgentOrg(context.supabase, context.userId, data.orgId);
    const { bulkAssignClientLender } = await import("./agent-network.server");
    const results = await bulkAssignClientLender(await admin(), {
      ...data,
      userId: context.userId,
    });
    return { results };
  });
