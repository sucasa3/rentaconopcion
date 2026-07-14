import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ PRO: LIST MY OFFERS (pending, live) ============
export const listMyOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Find pro row for this user
    const { data: pro } = await supabaseAdmin
      .from("pros")
      .select("id, business_name, is_founding_partner, monthly_price_cents, accepting_leads")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!pro) return { pro: null, offers: [], claims: [] };

    const [offersRes, claimsRes] = await Promise.all([
      supabaseAdmin
        .from("lead_offers")
        .select(
          "id, status, position, offered_at, expires_at, service_request_id, service_requests!inner(id, category, city, state, zip, timeline, budget_min, budget_max, description)",
        )
        .eq("pro_id", pro.id)
        .eq("status", "pending")
        .order("offered_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("lead_assignments")
        .select(
          "id, claimed_at, service_request_id, service_requests!inner(id, category, city, state, zip, description, homeowner_id, profiles:homeowner_id(full_name, phone, email))",
        )
        .eq("pro_id", pro.id)
        .order("claimed_at", { ascending: false })
        .limit(20),
    ]);
    if (offersRes.error) throw offersRes.error;
    if (claimsRes.error) throw claimsRes.error;
    return { pro, offers: offersRes.data ?? [], claims: claimsRes.data ?? [] };
  });

// ============ PRO: CLAIM ============
export const claimLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { offerId: string }) => z.object({ offerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: offer, error: oe } = await supabaseAdmin
      .from("lead_offers")
      .select("id, service_request_id, pro_id, status, expires_at, pros!inner(user_id)")
      .eq("id", data.offerId)
      .maybeSingle();
    if (oe) throw oe;
    if (!offer) throw new Error("Offer not found");
    const pros = offer.pros as unknown as { user_id: string };
    if (pros.user_id !== context.userId) throw new Error("Forbidden");
    if (offer.status !== "pending") throw new Error(`Offer is ${offer.status}`);
    if (new Date(offer.expires_at).getTime() < Date.now()) throw new Error("Offer expired");

    // Race guard: only one assignment per request
    const { data: existing } = await supabaseAdmin
      .from("lead_assignments")
      .select("id")
      .eq("service_request_id", offer.service_request_id)
      .maybeSingle();
    if (existing) throw new Error("Lead already claimed by another pro");

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("lead_offers")
      .update({ status: "accepted", responded_at: now })
      .eq("id", offer.id);
    await supabaseAdmin
      .from("lead_offers")
      .update({ status: "cancelled", responded_at: now })
      .eq("service_request_id", offer.service_request_id)
      .eq("status", "pending");
    const { data: assignment, error: ae } = await supabaseAdmin
      .from("lead_assignments")
      .insert({ service_request_id: offer.service_request_id, pro_id: offer.pro_id })
      .select("id")
      .single();
    if (ae) throw ae;
    await supabaseAdmin
      .from("service_requests")
      .update({ routing_status: "claimed" })
      .eq("id", offer.service_request_id);
    await supabaseAdmin
      .from("pros")
      .update({ claimed_count: (await getClaimedCount(offer.pro_id)) + 1 })
      .eq("id", offer.pro_id);

    // Push to GHL (best-effort)
    try {
      const ghl = await import("./ghl.server");
      const oppId = await ghl.createServiceLeadOpportunity(offer.service_request_id, offer.pro_id);
      if (oppId) {
        await supabaseAdmin
          .from("lead_assignments")
          .update({ ghl_opportunity_id: oppId })
          .eq("id", assignment.id);
      }
    } catch (e) {
      console.error("GHL service-lead push failed (non-fatal):", (e as Error).message);
    }

    return { claimed: true, assignmentId: assignment.id };
  });

async function getClaimedCount(proId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("lead_assignments")
    .select("id", { count: "exact", head: true })
    .eq("pro_id", proId);
  return count ?? 0;
}

// ============ PRO: DECLINE ============
export const declineLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { offerId: string }) => z.object({ offerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: offer } = await supabaseAdmin
      .from("lead_offers")
      .select("id, service_request_id, status, pros!inner(user_id)")
      .eq("id", data.offerId)
      .maybeSingle();
    if (!offer) throw new Error("Offer not found");
    const pros = offer.pros as unknown as { user_id: string };
    if (pros.user_id !== context.userId) throw new Error("Forbidden");
    if (offer.status !== "pending") throw new Error(`Offer is ${offer.status}`);
    await supabaseAdmin
      .from("lead_offers")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", offer.id);
    // Cascade to next pro
    const { offerNextPro } = await import("./leads.server");
    await offerNextPro(offer.service_request_id);
    return { declined: true };
  });

// ============ ADMIN: OVERVIEW ============
export const getLeadRoutingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const [unroutedRes, offersRes, claimsRes] = await Promise.all([
      supabaseAdmin
        .from("service_requests")
        .select("id, category, city, zip, created_at, description")
        .eq("routing_status", "unrouted")
        .in("source", ["homeowner", "app"])
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("lead_offers")
        .select(
          "id, status, offered_at, expires_at, position, service_request_id, pro_id, pros!inner(business_name), service_requests!inner(category, city, zip)",
        )
        .eq("status", "pending")
        .order("offered_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("lead_assignments")
        .select(
          "id, claimed_at, service_request_id, pros!inner(business_name), service_requests!inner(category, city, zip)",
        )
        .order("claimed_at", { ascending: false })
        .limit(20),
    ]);
    if (unroutedRes.error) throw unroutedRes.error;
    if (offersRes.error) throw offersRes.error;
    if (claimsRes.error) throw claimsRes.error;
    return {
      unrouted: unroutedRes.data ?? [],
      liveOffers: offersRes.data ?? [],
      recentClaims: claimsRes.data ?? [],
    };
  });

// ============ ADMIN: FORCE REASSIGN ============
export const adminForceReassign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    // Cancel any pending offers, then re-offer to next pro.
    await supabaseAdmin
      .from("lead_offers")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("service_request_id", data.requestId)
      .eq("status", "pending");
    const { offerNextPro } = await import("./leads.server");
    const result = await offerNextPro(data.requestId);
    return result;
  });

// ============ ADMIN: RUN TICK (manual drain button) ============
export const runLeadTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { expireStaleOffers } = await import("./leads.server");
    return expireStaleOffers();
  });
