import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Catalog of campaigns (any signed-in partner/admin can read). */
export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("campaigns")
      .select("*")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Activations + recent sends for one partner org. */
export const getOrgCampaignState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ orgId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const [{ data: activations }, { data: sends }] = await Promise.all([
      context.supabase
        .from("campaign_activations")
        .select("id, campaign_id, portfolio_id, portfolio_client_id, active")
        .eq("lender_org_id", data.orgId),
      context.supabase
        .from("campaign_sends")
        .select("id, campaign_id, recipient_name, recipient_email, subject, status, created_at")
        .eq("lender_org_id", data.orgId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    return { activations: activations ?? [], sends: sends ?? [] };
  });

/** Turn a campaign on/off for an org (optionally scoped to a portfolio). */
export const setCampaignActivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        orgId: z.string().uuid(),
        campaignId: z.string().uuid(),
        portfolioId: z.string().uuid().nullable().optional(),
        active: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("campaign_activations")
      .select("id")
      .eq("lender_org_id", data.orgId)
      .eq("campaign_id", data.campaignId)
      .is("portfolio_client_id", null)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("campaign_activations")
        .update({ active: data.active, portfolio_id: data.portfolioId ?? null })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true as const, id: existing.id };
    }

    const { data: row, error } = await context.supabase
      .from("campaign_activations")
      .insert({
        lender_org_id: data.orgId,
        campaign_id: data.campaignId,
        portfolio_id: data.portfolioId ?? null,
        active: data.active,
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: row?.id ?? null };
  });

/** Admin: preview or actually run the campaign engine. */
export const runCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        dryRun: z.boolean().default(true),
        limit: z.number().int().min(1).max(500).default(25),
        campaignKey: z.string().optional(),
        orgId: z.string().uuid().optional(),
        clientId: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { runCampaignTick } = await import("@/lib/campaigns-run.server");
    return runCampaignTick(data);
  });

/** Admin: recent sends across all orgs. */
export const getCampaignSends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data } = await context.supabase
      .from("campaign_sends")
      .select("id, campaign_id, recipient_name, recipient_email, subject, status, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });
