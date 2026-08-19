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

/* ---------------------------------------------------------------------------
 * Partner branding + per-campaign wording overrides + preview
 * ------------------------------------------------------------------------- */

async function assertOrgMember(supabase: any, userId: string, orgId: string) {
  const { data: member } = await supabase
    .from("lender_members")
    .select("id")
    .eq("lender_org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (member) return;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden: not a member of this organization");
}

const BRAND_FIELDS =
  "id, name, org_type, sender_name, reply_to_email, contact_name, contact_title, contact_phone, license_number, logo_url, signoff";

/** Branding + overrides for one partner org. */
export const getOrgBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ orgId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const [{ data: org }, { data: overrides }] = await Promise.all([
      context.supabase.from("lender_orgs").select(BRAND_FIELDS).eq("id", data.orgId).maybeSingle(),
      context.supabase
        .from("campaign_org_overrides")
        .select("campaign_id, subject, intro, closing, cta_label, cta_url")
        .eq("lender_org_id", data.orgId),
    ]);
    return { org: org ?? null, overrides: overrides ?? [] };
  });

const MEMBER_BRAND_FIELDS =
  "user_id, sender_name, reply_to_email, contact_name, contact_title, contact_phone, license_number, logo_url, signoff";

/**
 * The signed-in member's own sender identity for this org. If they have never
 * saved one, we return a seeded draft from their account profile so nothing is
 * blank on day one. Also reports whether they can edit the org-wide defaults.
 */
export const getMyMemberBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ orgId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);

    const [{ data: existing }, { data: member }, { data: profile }] = await Promise.all([
      context.supabase
        .from("lender_member_profiles")
        .select(MEMBER_BRAND_FIELDS)
        .eq("lender_org_id", data.orgId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("lender_members")
        .select("role")
        .eq("lender_org_id", data.orgId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("profiles")
        .select("full_name, email, phone")
        .eq("id", context.userId)
        .maybeSingle(),
    ]);

    const role = member?.role ?? null;
    const canEditOrg = !role || ["owner", "admin", "manager"].includes(role);

    const seeded = {
      user_id: context.userId,
      sender_name: null as string | null,
      reply_to_email: profile?.email ?? null,
      contact_name: profile?.full_name ?? null,
      contact_title: null as string | null,
      contact_phone: profile?.phone ?? null,
      license_number: null as string | null,
      logo_url: null as string | null,
      signoff: null as string | null,
    };

    return {
      profile: existing ?? seeded,
      saved: !!existing,
      role,
      canEditOrg,
    };
  });

const MemberBrandSchema = z.object({
  orgId: z.string().uuid(),
  sender_name: z.string().trim().max(120).nullable().optional(),
  reply_to_email: z.string().trim().email().max(180).nullable().or(z.literal("")).optional(),
  contact_name: z.string().trim().max(120).nullable().optional(),
  contact_title: z.string().trim().max(120).nullable().optional(),
  contact_phone: z.string().trim().max(40).nullable().optional(),
  license_number: z.string().trim().max(60).nullable().optional(),
  logo_url: z.string().trim().max(2000).nullable().optional(),
  signoff: z.string().trim().max(200).nullable().optional(),
});

/** Save the signed-in member's own sender identity. */
export const saveMemberBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => MemberBrandSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const norm = (v: string | null | undefined) => (v == null || v === "" ? null : v);
    const row = {
      lender_org_id: data.orgId,
      user_id: context.userId,
      sender_name: norm(data.sender_name),
      reply_to_email: norm(data.reply_to_email),
      contact_name: norm(data.contact_name),
      contact_title: norm(data.contact_title),
      contact_phone: norm(data.contact_phone),
      license_number: norm(data.license_number),
      logo_url: norm(data.logo_url),
      signoff: norm(data.signoff),
    };
    const { error } = await context.supabase
      .from("lender_member_profiles")
      .upsert(row, { onConflict: "lender_org_id,user_id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });


const BrandSchema = z.object({
  orgId: z.string().uuid(),
  sender_name: z.string().trim().max(120).nullable().optional(),
  reply_to_email: z.string().trim().email().max(180).nullable().or(z.literal("")).optional(),
  contact_name: z.string().trim().max(120).nullable().optional(),
  contact_title: z.string().trim().max(120).nullable().optional(),
  contact_phone: z.string().trim().max(40).nullable().optional(),
  license_number: z.string().trim().max(60).nullable().optional(),
  logo_url: z.string().trim().max(2000).nullable().optional(),
  signoff: z.string().trim().max(200).nullable().optional(),
});

export const saveOrgBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => BrandSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { orgId, ...fields } = data;
    const norm = (v: string | null | undefined) => (v == null || v === "" ? null : v);
    const patch = {
      sender_name: norm(fields.sender_name),
      reply_to_email: norm(fields.reply_to_email),
      contact_name: norm(fields.contact_name),
      contact_title: norm(fields.contact_title),
      contact_phone: norm(fields.contact_phone),
      license_number: norm(fields.license_number),
      logo_url: norm(fields.logo_url),
      signoff: norm(fields.signoff),
    };
    const { error } = await context.supabase.from("lender_orgs").update(patch).eq("id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const OverrideSchema = z.object({
  orgId: z.string().uuid(),
  campaignId: z.string().uuid(),
  subject: z.string().trim().max(120).nullable().optional(),
  intro: z.string().trim().max(400).nullable().optional(),
  closing: z.string().trim().max(400).nullable().optional(),
  cta_label: z.string().trim().max(60).nullable().optional(),
  cta_url: z.string().trim().url().max(500).nullable().or(z.literal("")).optional(),
});

export const saveCampaignOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OverrideSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const row = {
      lender_org_id: data.orgId,
      campaign_id: data.campaignId,
      subject: data.subject || null,
      intro: data.intro || null,
      closing: data.closing || null,
      cta_label: data.cta_label || null,
      cta_url: data.cta_url || null,
      updated_by: context.userId,
    };
    const { error } = await context.supabase
      .from("campaign_org_overrides")
      .upsert(row, { onConflict: "lender_org_id,campaign_id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const resetCampaignOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ orgId: z.string().uuid(), campaignId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { error } = await context.supabase
      .from("campaign_org_overrides")
      .delete()
      .eq("lender_org_id", data.orgId)
      .eq("campaign_id", data.campaignId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Clients in this org's portfolios — used to pick a preview recipient. */
export const listOrgCampaignClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ orgId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { data: portfolios } = await context.supabase
      .from("lender_portfolios")
      .select("id")
      .eq("lender_org_id", data.orgId);
    const ids = (portfolios ?? []).map((p) => p.id);
    if (!ids.length) return [];
    const { data: clients } = await context.supabase
      .from("lender_portfolio_clients")
      .select("id, client_name, client_email, address_line1, city, state")
      .in("portfolio_id", ids)
      .order("client_name")
      .limit(300);
    return clients ?? [];
  });

/** Render (never send) the exact email one client would receive. */
export const previewCampaignForClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ orgId: z.string().uuid(), campaignId: z.string().uuid(), clientId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);

    const [{ data: campaign }, { data: org }, { data: client }, { data: override }] = await Promise.all([
      context.supabase.from("campaigns").select("*").eq("id", data.campaignId).maybeSingle(),
      context.supabase.from("lender_orgs").select(BRAND_FIELDS).eq("id", data.orgId).maybeSingle(),
      context.supabase
        .from("lender_portfolio_clients")
        .select(
          "id, portfolio_id, homeowner_id, client_name, client_email, client_phone, address_line1, city, state, zip, close_date, loan_amount_at_close_cents, rate_at_close",
        )
        .eq("id", data.clientId)
        .maybeSingle(),
      context.supabase
        .from("campaign_org_overrides")
        .select("subject, intro, closing, cta_label, cta_url")
        .eq("lender_org_id", data.orgId)
        .eq("campaign_id", data.campaignId)
        .maybeSingle(),
    ]);

    if (!campaign || !org || !client) throw new Error("Preview unavailable for this selection");

    const mod = await import("@/lib/campaigns.server");
    const target = {
      clientId: client.id,
      orgId: org.id,
      orgName: org.name,
      orgType: org.org_type ?? "lender",
      homeownerId: client.homeowner_id,
      name: client.client_name,
      email: client.client_email,
      phone: client.client_phone,
      address: client.address_line1,
      city: client.city,
      state: client.state,
      zip: client.zip,
      closeDate: client.close_date,
      loanAtCloseCents: client.loan_amount_at_close_cents,
      rateAtClose: client.rate_at_close,
    };

    const facts = await mod.loadCachedFacts(target);
    const branding = mod.brandingFromOrg(org);
    const copy = await mod.generateCopy(
      campaign as never,
      facts,
      target,
      "en",
      override ?? null,
    );
    const payload = mod.buildPayload(campaign as never, facts, target, copy, branding, override ?? null);
    const due = mod.isDue(campaign as never, facts, target, null);

    return {
      subject: copy.subject,
      body: copy.body,
      due: due.due,
      dueReason: due.reason,
      recipient: { name: client.client_name, email: client.client_email },
      branding,
      cta: { label: payload.next_cta, url: payload.cta_url },
      footer: payload.sent_on_behalf_of,
      signature: payload.signature_block,
    };
  });
