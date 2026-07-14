import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Push current signed-in homeowner to Fello + pull enrichment back.
// Idempotent: if profile already has fello_contact_id, refresh instead.
export const syncMyHomeToFello = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fello = await import("./fello.server");

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, phone, address, city, state, zip, fello_contact_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!profile) throw new Error("Profile not found");

    const fullAddress = [profile.address, profile.city, profile.state, profile.zip]
      .filter(Boolean)
      .join(", ") || null;

    let contactId = profile.fello_contact_id;
    if (!contactId) {
      const created = await fello.addFelloContact({
        name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        address: fullAddress || undefined,
        tags: ["sucasa-homeowner"],
        crmFields: {
          name: "SuCasa",
          source: "SuCasa App",
          stage: "Homeowner",
          createdDate: new Date().toISOString(),
        },
      });
      contactId = created.contactId;
    } else if (fullAddress) {
      // Attach property to existing contact (safe even if it already exists).
      try {
        await fello.addFelloProperty(contactId, fullAddress);
      } catch {
        /* ignore duplicates */
      }
    }

    // Pull enriched details.
    let valuation: { estimatedValueCents: number | null; equityCents: number | null } = {
      estimatedValueCents: null,
      equityCents: null,
    };
    let leadScore: number | null = null;
    try {
      const enriched = contactId
        ? await fello.getFelloContact({ contactId })
        : null;
      if (enriched) {
        valuation = fello.extractValuation(enriched);
        leadScore = typeof enriched.leadScore === "number" ? enriched.leadScore : null;
      }
    } catch {
      /* enrichment may lag — fine */
    }

    await supabaseAdmin
      .from("profiles")
      .update({
        fello_contact_id: contactId,
        fello_estimated_value_cents: valuation.estimatedValueCents,
        fello_equity_cents: valuation.equityCents,
        fello_lead_score: leadScore,
        fello_last_synced_at: new Date().toISOString(),
      })
      .eq("id", context.userId);

    return {
      contactId,
      estimatedValueCents: valuation.estimatedValueCents,
      equityCents: valuation.equityCents,
      leadScore,
    };
  });

// Admin: force refresh of any homeowner from Fello.
export const refreshHomeownerFromFello = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fello = await import("./fello.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, fello_contact_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found");

    const enriched = await fello.getFelloContact({
      contactId: profile.fello_contact_id ?? undefined,
      email: profile.email ?? undefined,
    });
    if (!enriched) return { refreshed: false };

    const v = fello.extractValuation(enriched);
    await supabaseAdmin
      .from("profiles")
      .update({
        fello_contact_id: enriched.contactId,
        fello_estimated_value_cents: v.estimatedValueCents,
        fello_equity_cents: v.equityCents,
        fello_lead_score: typeof enriched.leadScore === "number" ? enriched.leadScore : null,
        fello_last_synced_at: new Date().toISOString(),
      })
      .eq("id", profile.id);
    return { refreshed: true, valuation: v };
  });

// Admin: webhook management.
const EVENTS = [
  "FormSubmission",
  "ContactEnriched",
  "DashboardClick",
  "EmailClick",
  "PostcardScan",
  "ContactUnsubscribed",
  "ContactDetailsUpdated",
  "TagsAdded",
  "TagsRemoved",
  "FelixAIHandoff",
] as const;

export const subscribeFelloWebhookFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { eventType: (typeof EVENTS)[number]; baseUrl: string }) =>
    z.object({ eventType: z.enum(EVENTS), baseUrl: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const token = process.env.FELLO_WEBHOOK_TOKEN;
    if (!token) throw new Error("FELLO_WEBHOOK_TOKEN not configured");
    const url = `${data.baseUrl.replace(/\/$/, "")}/api/public/fello/webhook?token=${encodeURIComponent(token)}`;

    const fello = await import("./fello.server");
    const r = await fello.subscribeFelloWebhook(url, data.eventType);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("fello_webhook_subscriptions").upsert(
      {
        subscription_id: r.subscriptionId,
        event_type: data.eventType,
        url,
        status: r.status ?? "Active",
      },
      { onConflict: "subscription_id" },
    );
    return r;
  });

export const listFelloState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [subs, events] = await Promise.all([
      supabaseAdmin
        .from("fello_webhook_subscriptions")
        .select("subscription_id, event_type, url, status, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("fello_events")
        .select("id, event_type, fello_contact_id, received_at")
        .order("received_at", { ascending: false })
        .limit(20),
    ]);
    return {
      subscriptions: subs.data ?? [],
      recentEvents: events.data ?? [],
    };
  });
