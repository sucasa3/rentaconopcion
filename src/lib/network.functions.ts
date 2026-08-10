import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  agentLenderPartners,
  allocateSponsorshipRow,
  assertConnection,
  assertMember,
  createIntroductionRequest,
  deidentifiedOpportunities,
  lenderNetworkSummary,
  listCampaignApprovalRows,
  listIntroductionRows,
  myOrgs,
  pendingInvitesForUser,
  proposeCampaignAudienceRow,
  respondToInvite,
  revealApprovedContact,
  sponsorshipSummary,
} from "./network.server";

const uuid = z.string().uuid();

/** Organizations the caller belongs to, with plan and role. */
export const listMyOrgs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    orgs: await myOrgs(context.supabase, context.userId),
    email: (context.claims as any)?.email ?? null,
  }));

// --- Connections -----------------------------------------------------------

/** Lender view: every connection plus aggregate, de-identified network counts. */
export const getLenderNetwork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ lenderOrgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.lenderOrgId);
    return lenderNetworkSummary(context.supabase, data.lenderOrgId);
  });

/** Invite an agent to connect, by email. */
export const inviteAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        lenderOrgId: uuid,
        email: z.string().email(),
        name: z.string().max(120).optional(),
        message: z.string().max(600).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.lenderOrgId);
    const { error } = await context.supabase.from("agent_lender_connections").insert({
      lender_org_id: data.lenderOrgId,
      invited_email: data.email.toLowerCase(),
      invited_name: data.name ?? null,
      message: data.message ?? null,
      status: "invited",
      invited_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Agent view: pending invitations addressed to the caller, plus lender partners. */
export const getAgentNetwork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ agentOrgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.agentOrgId);
    const email = ((context.claims as any)?.email as string | undefined) ?? null;
    return {
      invites: await pendingInvitesForUser(context.userId, email),
      partners: await agentLenderPartners(context.supabase, data.agentOrgId),
    };
  });

/** Agent accepts or declines a lender's invitation. */
export const respondToConnectionInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ connectionId: uuid, agentOrgId: uuid, accept: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.agentOrgId);
    const email = ((context.claims as any)?.email as string | undefined) ?? null;
    return respondToInvite(
      context.userId,
      email,
      data.connectionId,
      data.agentOrgId,
      data.accept,
    );
  });

// --- Discovery -------------------------------------------------------------

/** De-identified opportunity rows inside a connected agent's book. */
export const listNetworkOpportunities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        lenderOrgId: uuid,
        agentOrgId: uuid,
        category: z.string().max(40).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.lenderOrgId);
    const opportunities = await deidentifiedOpportunities(
      context.supabase,
      data.lenderOrgId,
      data.agentOrgId,
      { category: data.category, limit: data.limit },
    );
    return { opportunities };
  });

// --- Introductions ---------------------------------------------------------

export const listIntroductions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const org = await assertMember(context.supabase, context.userId, data.orgId);
    return { requests: await listIntroductionRows(context.supabase, data.orgId, org.org_type) };
  });

export const requestIntroduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ lenderOrgId: uuid, opportunityId: uuid, note: z.string().max(600).optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.lenderOrgId);
    return createIntroductionRequest(
      context.supabase,
      data.lenderOrgId,
      data.opportunityId,
      data.note ?? null,
      context.userId,
    );
  });

/** The agent approves or declines an introduction. Approval is the only unmask. */
export const respondToIntroduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ requestId: uuid, approve: z.boolean(), responseNote: z.string().max(600).optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: req, error: readErr } = await context.supabase
      .from("introduction_requests")
      .select("id, agent_org_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!req) throw new Error("Introduction request not found");
    await assertMember(context.supabase, context.userId, req.agent_org_id);

    const { error } = await context.supabase
      .from("introduction_requests")
      .update({
        status: data.approve ? "approved" : "declined",
        response_note: data.responseNote ?? null,
      })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { id: data.requestId, status: data.approve ? "approved" : "declined" };
  });

/** Reveal homeowner contact for an agent-approved introduction (audited). */
export const revealIntroduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ requestId: uuid }).parse(i))
  .handler(async ({ data, context }) =>
    revealApprovedContact(context.supabase, context.userId, data.requestId),
  );

// --- Sponsored premium profiles -------------------------------------------

export const getSponsorships = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const org = await assertMember(context.supabase, context.userId, data.orgId);
    return sponsorshipSummary(context.supabase, data.orgId, org.org_type);
  });

export const allocateSponsorship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ sponsorOrgId: uuid, agentOrgId: uuid, portfolioClientId: uuid }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.sponsorOrgId);
    return allocateSponsorshipRow(
      context.supabase,
      data.sponsorOrgId,
      data.agentOrgId,
      data.portfolioClientId,
      context.userId,
    );
  });

/**
 * End a sponsorship. The homeowner profile stays intact and portable — only
 * the premium sponsorship lapses, after its grace window.
 */
export const endSponsorship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sponsored_profiles")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Campaign approvals ----------------------------------------------------

export const listCampaignApprovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const org = await assertMember(context.supabase, context.userId, data.orgId);
    return { approvals: await listCampaignApprovalRows(context.supabase, data.orgId, org.org_type) };
  });

export const proposeCampaignAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        lenderOrgId: uuid,
        agentOrgId: uuid,
        campaignId: uuid,
        category: z.string().max(40).nullable().optional(),
        note: z.string().max(600).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.lenderOrgId);
    return proposeCampaignAudienceRow(
      context.supabase,
      data.lenderOrgId,
      data.agentOrgId,
      data.campaignId,
      data.category ?? null,
      data.note ?? null,
      context.userId,
    );
  });

/** The agent approves or declines a lender-proposed campaign audience. */
export const respondToCampaignAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ id: uuid, approve: z.boolean(), responseNote: z.string().max(600).optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error: readErr } = await context.supabase
      .from("campaign_approvals")
      .select("id, agent_org_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Campaign approval not found");
    await assertMember(context.supabase, context.userId, row.agent_org_id);

    const { error } = await context.supabase
      .from("campaign_approvals")
      .update({
        status: data.approve ? "approved" : "declined",
        response_note: data.responseNote ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id, status: data.approve ? "approved" : "declined" };
  });

// --- Plans -----------------------------------------------------------------

export const listPlanTiers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("plan_tiers")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { tiers: data ?? [] };
  });
