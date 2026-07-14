// Lead routing core — server-only. Uses supabaseAdmin (RLS bypass).
// Round-robin per (category, metro || zip), one active offer per request, 25-min SLA.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SLA_MINUTES = 25;

export async function offerNextPro(requestId: string): Promise<{ offered: boolean; proId?: string; reason?: string }> {
  const { data: req, error: reqErr } = await supabaseAdmin
    .from("service_requests")
    .select("id, category, zip, metro, routing_status")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw reqErr;
  if (!req) return { offered: false, reason: "request_not_found" };
  if (req.routing_status === "claimed" || req.routing_status === "cancelled") {
    return { offered: false, reason: `already_${req.routing_status}` };
  }

  const useMetro = !!req.metro;
  const key = useMetro ? req.metro! : req.zip;
  if (!key) return { offered: false, reason: "missing_metro_or_zip" };

  // Find all eligible pros for this (category, metro|zip)
  const covQuery = supabaseAdmin
    .from("pro_coverage")
    .select("pro_id, pros!inner(id, business_name, phone, active, accepting_leads)")
    .eq("category", req.category);
  const { data: coverage, error: covErr } = await (useMetro
    ? covQuery.eq("metro", key)
    : covQuery.eq("zip", key));
  if (covErr) throw covErr;
  const eligible = (coverage ?? [])
    .map((c) => c.pros as unknown as { id: string; business_name: string; phone: string | null; active: boolean; accepting_leads: boolean })
    .filter((p) => p && p.active && p.accepting_leads);
  if (!eligible.length) {
    await supabaseAdmin.from("service_requests").update({ routing_status: "unrouted" }).eq("id", requestId);
    return { offered: false, reason: "no_eligible_pros" };
  }

  // Exclude pros already offered this request
  const { data: prior } = await supabaseAdmin
    .from("lead_offers")
    .select("pro_id")
    .eq("service_request_id", requestId);
  const already = new Set((prior ?? []).map((o) => o.pro_id));
  const pool = eligible.filter((p) => !already.has(p.id));
  if (!pool.length) {
    await supabaseAdmin.from("service_requests").update({ routing_status: "unrouted" }).eq("id", requestId);
    return { offered: false, reason: "exhausted_rotation" };
  }

  // Round-robin cursor per (category, metro|zip)
  const cursorQ = supabaseAdmin
    .from("rr_cursor")
    .select("last_pro_id")
    .eq("category", req.category);
  const { data: cursor } = await (useMetro
    ? cursorQ.eq("metro", key).maybeSingle()
    : cursorQ.eq("zip", key).maybeSingle());
  const ordered = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  let idx = 0;
  if (cursor?.last_pro_id) {
    const lastIdx = ordered.findIndex((p) => p.id === cursor.last_pro_id);
    idx = lastIdx >= 0 ? (lastIdx + 1) % ordered.length : 0;
  }
  const next = ordered[idx];

  const position = (prior?.length ?? 0) + 1;
  const expires = new Date(Date.now() + SLA_MINUTES * 60_000).toISOString();
  const { error: offErr } = await supabaseAdmin.from("lead_offers").insert({
    service_request_id: requestId,
    pro_id: next.id,
    position,
    status: "pending",
    expires_at: expires,
  });
  if (offErr) throw offErr;

  if (useMetro) {
    await supabaseAdmin
      .from("rr_cursor")
      .upsert(
        { category: req.category, metro: key, zip: "", last_pro_id: next.id, updated_at: new Date().toISOString() },
        { onConflict: "category,metro" },
      );
  } else {
    await supabaseAdmin
      .from("rr_cursor")
      .upsert(
        { category: req.category, zip: key, last_pro_id: next.id, updated_at: new Date().toISOString() },
        { onConflict: "category,zip" },
      );
  }
  await supabaseAdmin.from("service_requests").update({ routing_status: "offered" }).eq("id", requestId);

  // Best-effort SMS via GHL (skipped silently if not configured)
  try {
    const ghl = await import("./ghl.server");
    if (next.phone) {
      await ghl.sendProSms(
        next.phone,
        `SuCasa: New ${req.category} lead in ${key}. Claim within ${SLA_MINUTES} min: https://sucasa.com/pro`,
      );
    }
  } catch (e) {
    console.error("Pro SMS failed (non-fatal):", (e as Error).message);
  }

  return { offered: true, proId: next.id };
}

// Cron entry: expire stale offers and cascade to next pro in queue.
export async function expireStaleOffers(): Promise<{ expired: number; requeued: number; routed: number }> {
  const nowIso = new Date().toISOString();

  const { data: stale, error: staleErr } = await supabaseAdmin
    .from("lead_offers")
    .update({ status: "expired", responded_at: nowIso })
    .eq("status", "pending")
    .lt("expires_at", nowIso)
    .select("id, service_request_id");
  if (staleErr) throw staleErr;
  const expired = stale?.length ?? 0;

  const requestIds = Array.from(new Set((stale ?? []).map((o) => o.service_request_id)));
  let requeued = 0;
  for (const rid of requestIds) {
    const { data: assigned } = await supabaseAdmin
      .from("lead_assignments")
      .select("id")
      .eq("service_request_id", rid)
      .maybeSingle();
    if (assigned) continue;
    const r = await offerNextPro(rid);
    if (r.offered) requeued++;
  }

  const { data: fresh } = await supabaseAdmin
    .from("service_requests")
    .select("id")
    .eq("routing_status", "unrouted")
    .in("source", ["homeowner", "app"])
    .order("created_at", { ascending: true })
    .limit(25);
  let routed = 0;
  for (const r of fresh ?? []) {
    const res = await offerNextPro(r.id);
    if (res.offered) routed++;
  }

  return { expired, requeued, routed };
}
