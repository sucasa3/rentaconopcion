/**
 * Campaign scheduler — decides which homeowners are due, generates the copy,
 * records the send, then hands the payload to GoHighLevel.
 *
 * Server-only. Invoked by the daily cron route and by admin dry-run/test tools.
 */

import {
  loadCachedFacts,
  isDue,
  generateCopy,
  buildPayload,
  brandingFromOrg,
  mergeBranding,
  type MemberBrandFields,
  type CampaignRow,
  type CampaignTarget,
} from "@/lib/campaigns.server";

export type TickOptions = {
  limit?: number;
  dryRun?: boolean;
  campaignKey?: string;
  clientId?: string;
  orgId?: string;
};

export type TickResult = {
  evaluated: number;
  generated: number;
  sent: number;
  skipped: number;
  errors: number;
  samples: Array<{
    client: string;
    campaign: string;
    status: string;
    subject?: string;
    body?: string;
    reason?: string;
  }>;
};

const MONTHLY_CAP = 2;

/**
 * Imported books contain placeholder rows where the address was unknown at
 * upload time ("Address on file"). They have no property record, so campaign
 * copy would be empty or wrong — never send to them.
 */
export function isPlaceholderAddress(address: string | null | undefined): boolean {
  if (!address) return true;
  return /address\s+on\s+file/i.test(address.trim());
}

export async function runCampaignTick(opts: TickOptions = {}): Promise<TickResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limit = opts.limit ?? 100;
  const result: TickResult = { evaluated: 0, generated: 0, sent: 0, skipped: 0, errors: 0, samples: [] };

  const { data: campaignRows } = await supabaseAdmin
    .from("campaigns")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  const campaigns = (campaignRows ?? []) as unknown as CampaignRow[];
  if (!campaigns.length) return result;

  let actQ = supabaseAdmin
    .from("campaign_activations")
    .select("id, lender_org_id, campaign_id, portfolio_id, portfolio_client_id")
    .eq("active", true);
  if (opts.orgId) actQ = actQ.eq("lender_org_id", opts.orgId);
  const { data: activations } = await actQ;
  if (!activations?.length) return result;

  const orgIds = [...new Set(activations.map((a) => a.lender_org_id))];
  const { data: orgs } = await supabaseAdmin
    .from("lender_orgs")
    .select(
      "id, name, org_type, sender_name, reply_to_email, contact_name, contact_title, contact_phone, license_number, logo_url, signoff",
    )
    .in("id", orgIds);
  const orgById = new Map((orgs ?? []).map((o) => [o.id, o]));

  const { data: overrideRows } = await supabaseAdmin
    .from("campaign_org_overrides")
    .select("lender_org_id, campaign_id, subject, intro, closing, cta_label, cta_url")
    .in("lender_org_id", orgIds);
  const overrideByPair = new Map(
    (overrideRows ?? []).map((o) => [`${o.lender_org_id}:${o.campaign_id}`, o]),
  );

  const { data: portfolios } = await supabaseAdmin
    .from("lender_portfolios")
    .select("id, lender_org_id, assigned_user_id")
    .in("lender_org_id", orgIds);
  const portfolioIds = (portfolios ?? []).map((p) => p.id);
  const orgByPortfolio = new Map((portfolios ?? []).map((p) => [p.id, p.lender_org_id]));
  const ownerByPortfolio = new Map(
    (portfolios ?? []).map((p) => [p.id, p.assigned_user_id as string | null]),
  );

  // Per-MLO / per-agent sender identities (fall back to org defaults field-by-field)
  const ownerIds = [...new Set((portfolios ?? []).map((p) => p.assigned_user_id).filter(Boolean))] as string[];
  const memberBrandByKey = new Map<string, MemberBrandFields>();
  if (ownerIds.length) {
    const { data: memberProfiles } = await supabaseAdmin
      .from("lender_member_profiles")
      .select(
        "lender_org_id, user_id, sender_name, reply_to_email, contact_name, contact_title, contact_phone, license_number, logo_url, signoff",
      )
      .in("lender_org_id", orgIds)
      .in("user_id", ownerIds);
    for (const m of memberProfiles ?? []) {
      memberBrandByKey.set(`${m.lender_org_id}:${m.user_id}`, m as MemberBrandFields);
    }
  }

  if (!portfolioIds.length) return result;

  let clientQ = supabaseAdmin
    .from("lender_portfolio_clients")
    .select(
      "id, portfolio_id, homeowner_id, client_name, client_email, client_phone, address_line1, city, state, zip, close_date, loan_amount_at_close_cents, rate_at_close",
    )
    .in("portfolio_id", portfolioIds);
  if (opts.clientId) clientQ = clientQ.eq("id", opts.clientId);
  const { data: clients } = await clientQ;
  if (!clients?.length) return result;

  const clientsByPortfolio = new Map<string, typeof clients>();
  for (const c of clients) {
    const arr = clientsByPortfolio.get(c.portfolio_id) ?? [];
    arr.push(c);
    clientsByPortfolio.set(c.portfolio_id, arr);
  }

  // Recent sends for cap + cadence checks
  const { data: recentSends } = await supabaseAdmin
    .from("campaign_sends")
    .select("campaign_id, portfolio_client_id, created_at, status")
    .gte("created_at", new Date(Date.now() - 400 * 86400000).toISOString());
  const lastByPair = new Map<string, string>();
  const monthCount = new Map<string, number>();
  const monthAgo = Date.now() - 30 * 86400000;
  for (const s of recentSends ?? []) {
    if (!s.portfolio_client_id) continue;
    const k = `${s.campaign_id}:${s.portfolio_client_id}`;
    if (!lastByPair.has(k)) lastByPair.set(k, s.created_at);
    else if (new Date(s.created_at) > new Date(lastByPair.get(k)!)) lastByPair.set(k, s.created_at);
    if (new Date(s.created_at).getTime() > monthAgo) {
      monthCount.set(s.portfolio_client_id, (monthCount.get(s.portfolio_client_id) ?? 0) + 1);
    }
  }

  // Homeowner opt-outs
  const homeownerIds = clients.map((c) => c.homeowner_id).filter(Boolean) as string[];
  const optedOut = new Set<string>();
  if (homeownerIds.length) {
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, campaign_opt_out, language")
      .in("id", homeownerIds);
    for (const p of profs ?? []) if (p.campaign_opt_out) optedOut.add(p.id);
  }

  const factsCache = new Map<string, Awaited<ReturnType<typeof loadCachedFacts>>>();

  outer: for (const act of activations) {
    const campaign = campaigns.find((c) => c.id === act.campaign_id);
    if (!campaign) continue;
    if (opts.campaignKey && campaign.key !== opts.campaignKey) continue;

    const org = orgById.get(act.lender_org_id);
    if (!org) continue;

    // Resolve target clients for this activation's scope
    let scope = clients.filter((c) => orgByPortfolio.get(c.portfolio_id) === act.lender_org_id);
    if (act.portfolio_id) scope = scope.filter((c) => c.portfolio_id === act.portfolio_id);
    if (act.portfolio_client_id) scope = scope.filter((c) => c.id === act.portfolio_client_id);

    for (const c of scope) {
      if (result.generated >= limit) break outer;
      result.evaluated++;

      const skip = (reason: string) => {
        result.skipped++;
        if (result.samples.length < 20)
          result.samples.push({ client: c.client_name ?? c.id, campaign: campaign.key, status: "skipped", reason });
      };

      if (!c.client_email) { skip("no email"); continue; }
      if (isPlaceholderAddress(c.address_line1)) { skip("placeholder address"); continue; }
      if (c.homeowner_id && optedOut.has(c.homeowner_id)) { skip("opted out"); continue; }
      if ((monthCount.get(c.id) ?? 0) >= MONTHLY_CAP && !opts.dryRun) { skip("monthly cap"); continue; }

      const target: CampaignTarget = {
        clientId: c.id,
        orgId: org.id,
        orgName: org.name,
        orgType: org.org_type ?? "lender",
        homeownerId: c.homeowner_id,
        name: c.client_name,
        email: c.client_email,
        phone: c.client_phone,
        address: c.address_line1,
        city: c.city,
        state: c.state,
        zip: c.zip,
        closeDate: c.close_date,
        loanAtCloseCents: c.loan_amount_at_close_cents,
        rateAtClose: c.rate_at_close,
      };

      let facts = factsCache.get(c.id);
      if (!facts) {
        facts = await loadCachedFacts(target);
        factsCache.set(c.id, facts);
      }

      const due = isDue(campaign, facts, target, lastByPair.get(`${campaign.id}:${c.id}`) ?? null);
      if (!due.due && !opts.dryRun) { skip(due.reason); continue; }

      const override = overrideByPair.get(`${org.id}:${campaign.id}`) ?? null;
      const ownerId = ownerByPortfolio.get(c.portfolio_id) ?? null;
      const branding = mergeBranding(
        brandingFromOrg(org),
        ownerId ? memberBrandByKey.get(`${org.id}:${ownerId}`) ?? null : null,
      );
      const copy = await generateCopy(campaign, facts, target, "en", override);
      const payload = buildPayload(campaign, facts, target, copy, branding, override);
      result.generated++;

      if (opts.dryRun) {
        if (result.samples.length < 20)
          result.samples.push({
            client: c.client_name ?? c.id,
            campaign: campaign.key,
            status: due.due ? "would send" : `would skip (${due.reason})`,
            subject: copy.subject,
            body: copy.body,
          });
        continue;
      }

      const { data: sendRow } = await supabaseAdmin
        .from("campaign_sends")
        .insert({
          campaign_id: campaign.id,
          lender_org_id: org.id,
          portfolio_client_id: c.id,
          homeowner_id: c.homeowner_id,
          recipient_email: c.client_email,
          recipient_name: c.client_name,
          subject: copy.subject,
          body: copy.body,
          payload,
          status: "pending",
          crm_status: "pending",
        })
        .select("id")
        .maybeSingle();

      // 1) Email the homeowner. A CRM failure must never block this.
      let emailed = false;
      let emailError: string | null = null;
      try {
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        const res = await sendTemplateEmail("campaign-update", c.client_email, {
          fromName: branding.senderName || branding.orgName || org.name,
          replyTo: branding.replyToEmail ?? undefined,
          idempotencyKey: `campaign-update-${sendRow?.id ?? `${campaign.id}-${c.id}`}`,
          templateData: {
            firstName: payload.first_name,
            subject: copy.subject,
            body: copy.body,
            previewText: copy.subject,
            ctaLabel: payload.next_cta,
            ctaUrl: payload.cta_url,
            partnerName: payload.partner_name,
            contactName: payload.contact_name,
            contactTitle: payload.contact_title,
            contactPhone: payload.contact_phone,
            replyTo: payload.reply_to,
            license: payload.license,
            logoUrl: payload.logo_url,
            signoff: payload.signoff,
            propertyAddress: payload.property_address,
            propertyValue: payload.property_value,
            equity: payload.equity,
          },
        });
        emailed = res.sent;
        if (!res.sent) emailError = "recipient suppressed";
      } catch (e) {
        emailError = (e as Error).message.slice(0, 500);
      }

      try {
        const { pushCampaignContact } = await import("@/lib/ghl.server");
        const contactId = await pushCampaignContact({
          email: c.client_email,
          phone: c.client_phone,
          fullName: c.client_name,
          city: c.city,
          state: c.state,
          tag: campaign.ghl_tag,
          payload,
        });
        if (sendRow?.id) {
          await supabaseAdmin
            .from("campaign_sends")
            .update({
              status: emailed ? "sent" : "queued",
              crm_status: "synced",
              crm_error: null,
              error_message: emailError,
              ghl_contact_id: contactId,
              sent_at: emailed ? new Date().toISOString() : null,
            })
            .eq("id", sendRow.id);
        }
        if (emailed) result.sent++;
        else result.errors++;
        monthCount.set(c.id, (monthCount.get(c.id) ?? 0) + 1);
        if (result.samples.length < 20)
          result.samples.push({
            client: c.client_name ?? c.id,
            campaign: campaign.key,
            status: emailed ? "sent" : "email failed",
            subject: copy.subject,
            reason: emailError ?? undefined,
          });

      } catch (e) {
        result.errors++;
        const msg = (e as Error).message.slice(0, 500);
        // A CRM (GoHighLevel) failure must not hide or block the send itself:
        // record it separately and leave the send queued for retry.
        if (sendRow?.id) {
          await supabaseAdmin
            .from("campaign_sends")
            .update({
              status: emailed ? "sent" : "queued",
              crm_status: "failed",
              crm_error: msg,
              error_message: emailError,
              sent_at: emailed ? new Date().toISOString() : null,
            })
            .eq("id", sendRow.id);
        }

        if (result.samples.length < 20)
          result.samples.push({ client: c.client_name ?? c.id, campaign: campaign.key, status: "failed", reason: msg });
      }
    }
  }

  // Retry recent failures (bounded)
  await retryFailedSends(10);

  return result;
}

async function retryFailedSends(limit: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: failed } = await supabaseAdmin
    .from("campaign_sends")
    .select("id, recipient_email, recipient_name, payload, campaign_id")
    .eq("crm_status", "failed")
    .gte("created_at", new Date(Date.now() - 3 * 86400000).toISOString())
    .limit(limit);
  if (!failed?.length) return;

  const { data: campaignRows } = await supabaseAdmin.from("campaigns").select("id, ghl_tag");
  const tagById = new Map((campaignRows ?? []).map((c) => [c.id, c.ghl_tag]));
  const { pushCampaignContact } = await import("@/lib/ghl.server");

  for (const f of failed) {
    if (!f.recipient_email) continue;
    try {
      const contactId = await pushCampaignContact({
        email: f.recipient_email,
        fullName: f.recipient_name,
        tag: tagById.get(f.campaign_id) ?? "sucasa_campaign",
        payload: (f.payload ?? {}) as Record<string, string>,
      });
      await supabaseAdmin
        .from("campaign_sends")
        .update({
          status: "sent",
          crm_status: "synced",
          crm_error: null,
          ghl_contact_id: contactId,
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", f.id);
    } catch {
      /* leave failed for the next tick */
    }
  }
}

/**
 * Admin dry-run: send one real campaign email (and CRM push) to a chosen
 * address, using a real client's facts and the org's sender identity.
 */
export async function sendTestCampaignEmail(opts: {
  email: string;
  campaignKey?: string;
  orgId?: string;
  portfolioId?: string;
  clientId?: string;
  pushToCrm?: boolean;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: campaignRows } = await supabaseAdmin
    .from("campaigns")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  const campaigns = (campaignRows ?? []) as unknown as CampaignRow[];
  const campaign = opts.campaignKey
    ? campaigns.find((c) => c.key === opts.campaignKey)
    : campaigns[0];
  if (!campaign) throw new Error("No active campaign found");

  let actQ = supabaseAdmin
    .from("campaign_activations")
    .select("lender_org_id, portfolio_id")
    .eq("active", true)
    .eq("campaign_id", campaign.id);
  if (opts.orgId) actQ = actQ.eq("lender_org_id", opts.orgId);
  const { data: acts } = await actQ;
  const orgId = opts.orgId ?? acts?.[0]?.lender_org_id;
  if (!orgId) throw new Error(`No active organization for campaign ${campaign.key}`);

  const { data: org } = await supabaseAdmin
    .from("lender_orgs")
    .select(
      "id, name, org_type, sender_name, reply_to_email, contact_name, contact_title, contact_phone, license_number, logo_url, signoff",
    )
    .eq("id", orgId)
    .maybeSingle();
  if (!org) throw new Error("Organization not found");

  const { data: portfolios } = await supabaseAdmin
    .from("lender_portfolios")
    .select("id, assigned_user_id")
    .eq("lender_org_id", orgId);
  const portfolioIds = (portfolios ?? []).map((p) => p.id);

  const { data: clients } = await supabaseAdmin
    .from("lender_portfolio_clients")
    .select(
      "id, portfolio_id, homeowner_id, client_name, client_email, client_phone, address_line1, city, state, zip, close_date, loan_amount_at_close_cents, rate_at_close",
    )
    .in("portfolio_id", portfolioIds.length ? portfolioIds : ["00000000-0000-0000-0000-000000000000"])
    .limit(1);
  const c = clients?.[0];
  if (!c) throw new Error("No portfolio client available to build the test facts");

  const target: CampaignTarget = {
    clientId: c.id,
    orgId: org.id,
    orgName: org.name,
    orgType: org.org_type ?? "lender",
    homeownerId: c.homeowner_id,
    name: c.client_name,
    email: opts.email,
    phone: c.client_phone,
    address: c.address_line1,
    city: c.city,
    state: c.state,
    zip: c.zip,
    closeDate: c.close_date,
    loanAtCloseCents: c.loan_amount_at_close_cents,
    rateAtClose: c.rate_at_close,
  };

  const facts = await loadCachedFacts(target);

  const { data: override } = await supabaseAdmin
    .from("campaign_org_overrides")
    .select("subject, intro, closing, cta_label, cta_url")
    .eq("lender_org_id", org.id)
    .eq("campaign_id", campaign.id)
    .maybeSingle();

  const ownerId = (portfolios ?? []).find((p) => p.id === c.portfolio_id)?.assigned_user_id ?? null;
  let member: MemberBrandFields | null = null;
  if (ownerId) {
    const { data: m } = await supabaseAdmin
      .from("lender_member_profiles")
      .select(
        "sender_name, reply_to_email, contact_name, contact_title, contact_phone, license_number, logo_url, signoff",
      )
      .eq("lender_org_id", org.id)
      .eq("user_id", ownerId)
      .maybeSingle();
    member = (m as MemberBrandFields) ?? null;
  }

  const branding = mergeBranding(brandingFromOrg(org), member);
  const copy = await generateCopy(campaign, facts, target, "en", override ?? null);
  const payload = buildPayload(campaign, facts, target, copy, branding, override ?? null);

  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const emailResult = await sendTemplateEmail("campaign-update", opts.email, {
    fromName: branding.senderName || branding.orgName || org.name,
    replyTo: branding.replyToEmail ?? undefined,
    idempotencyKey: `campaign-test-${campaign.key}-${opts.email}-${Date.now()}`,
    templateData: {
      firstName: payload.first_name,
      subject: copy.subject,
      body: copy.body,
      previewText: copy.subject,
      ctaLabel: payload.next_cta,
      ctaUrl: payload.cta_url,
      partnerName: payload.partner_name,
      contactName: payload.contact_name,
      contactTitle: payload.contact_title,
      contactPhone: payload.contact_phone,
      replyTo: payload.reply_to,
      license: payload.license,
      logoUrl: payload.logo_url,
      signoff: payload.signoff,
      propertyAddress: payload.property_address,
      propertyValue: payload.property_value,
      equity: payload.equity,
    },
  });

  let crm: { pushed: boolean; contactId?: string | null; error?: string } = { pushed: false };
  if (opts.pushToCrm !== false) {
    try {
      const { pushCampaignContact } = await import("@/lib/ghl.server");
      const contactId = await pushCampaignContact({
        email: opts.email,
        fullName: c.client_name,
        city: c.city,
        state: c.state,
        tag: campaign.ghl_tag,
        payload,
      });
      crm = { pushed: true, contactId };
    } catch (e) {
      crm = { pushed: false, error: (e as Error).message.slice(0, 300) };
    }
  }

  return {
    campaign: campaign.key,
    org: org.name,
    to: opts.email,
    fromName: branding.senderName || branding.orgName || org.name,
    replyTo: branding.replyToEmail,
    subject: copy.subject,
    emailSent: emailResult.sent,
    emailReason: emailResult.sent ? null : emailResult.reason,
    crm,
  };
}
