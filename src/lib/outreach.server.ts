/**
 * Sending an outreach message from a Next Best Action card.
 *
 * Mirrors the campaign sender: the homeowner sees the professional's own
 * identity, the CRM push never blocks the email, and every send is recorded so
 * the funnel can count it.
 *
 * Server-only.
 */

import { brandingFromOrg, mergeBranding } from "@/lib/campaigns.server";
import { SITE_URL, openPixelUrl, clickUrl } from "@/lib/tracking.server";

export interface SendOutreachArgs {
  orgId: string;
  clientId: string;
  opportunityId: string | null;
  actorUserId: string;
  subject: string;
  body: string;
  ctaLabel?: string;
}

export interface SendOutreachResult {
  ok: boolean;
  messageId: string | null;
  reason?: string;
}

export async function sendOutreachEmail(args: SendOutreachArgs): Promise<SendOutreachResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: client } = await supabaseAdmin
    .from("lender_portfolio_clients")
    .select("id, client_name, client_email, client_phone, city, state, portfolio_id")
    .eq("id", args.clientId)
    .maybeSingle();
  if (!client?.client_email) {
    return { ok: false, messageId: null, reason: "This homeowner has no email address on file." };
  }

  const { data: org } = await supabaseAdmin
    .from("lender_orgs")
    .select(
      "id, name, sender_name, reply_to_email, contact_name, contact_title, contact_phone, license_number, logo_url, signoff",
    )
    .eq("id", args.orgId)
    .maybeSingle();
  const { data: member } = await supabaseAdmin
    .from("lender_member_profiles")
    .select(
      "sender_name, reply_to_email, contact_name, contact_title, contact_phone, license_number, logo_url, signoff",
    )
    .eq("lender_org_id", args.orgId)
    .eq("user_id", args.actorUserId)
    .maybeSingle();

  const branding = mergeBranding(brandingFromOrg(org ?? {}), member);

  const { data: message } = await supabaseAdmin
    .from("outreach_messages")
    .insert({
      org_id: args.orgId,
      portfolio_client_id: args.clientId,
      opportunity_id: args.opportunityId,
      actor_user_id: args.actorUserId,
      channel: "email",
      subject: args.subject,
      body: args.body,
      recipient_email: client.client_email,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (!message?.id) return { ok: false, messageId: null, reason: "Could not record the message." };

  const firstName = (client.client_name ?? "").trim().split(/\s+/)[0] || "";
  let sent = false;
  let error: string | null = null;
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const res = await sendTemplateEmail("campaign-update", client.client_email, {
      fromName: branding.senderName || branding.orgName || "SuCasa",
      replyTo: branding.replyToEmail ?? undefined,
      idempotencyKey: `outreach-${message.id}`,
      templateData: {
        firstName,
        subject: args.subject,
        body: args.body,
        previewText: args.subject,
        ctaLabel: args.ctaLabel ?? "See my home report",
        ctaUrl: clickUrl(message.id, `${SITE_URL}/dashboard`),
        partnerName: branding.orgName,
        contactName: branding.contactName,
        contactTitle: branding.contactTitle,
        contactPhone: branding.contactPhone,
        replyTo: branding.replyToEmail,
        license: branding.licenseNumber,
        logoUrl: branding.logoUrl,
        signoff: branding.signoff,
        trackingPixelUrl: openPixelUrl(message.id),
      },
    });
    sent = res.sent;
    if (!res.sent) error = "This address is on the do-not-contact list.";
  } catch (e) {
    error = (e as Error).message.slice(0, 400);
  }

  await supabaseAdmin
    .from("outreach_messages")
    .update({
      status: sent ? "sent" : "failed",
      error_message: error,
      sent_at: sent ? new Date().toISOString() : null,
    })
    .eq("id", message.id);

  if (sent) {
    await supabaseAdmin.from("outreach_events").insert({
      org_id: args.orgId,
      portfolio_client_id: args.clientId,
      opportunity_id: args.opportunityId,
      message_id: message.id,
      event: "sent",
      detail: "email",
    });

    // CRM push is best-effort and must never fail the send.
    try {
      const { pushCampaignContact } = await import("@/lib/ghl.server");
      await pushCampaignContact({
        email: client.client_email,
        phone: client.client_phone,
        fullName: client.client_name,
        city: client.city,
        state: client.state,
        tag: "sucasa-outreach",
        payload: { last_outreach_subject: args.subject.slice(0, 120) },
      });
    } catch {
      /* ignore */
    }
  }

  return { ok: sent, messageId: message.id, reason: error ?? undefined };
}

/** Mirror a logged outcome into the CRM as a note, best effort. */
export async function noteOutcomeInCrm(clientEmail: string | null, line: string) {
  if (!clientEmail) return;
  try {
    const { pushCampaignContact } = await import("@/lib/ghl.server");
    await pushCampaignContact({
      email: clientEmail,
      tag: "sucasa-outcome",
      payload: { last_outcome: line.slice(0, 120) },
    });
  } catch {
    /* ignore */
  }
}
