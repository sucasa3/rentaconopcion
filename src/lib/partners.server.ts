// Affiliate/partner network overflow — server-only. Uses supabaseAdmin (RLS bypass).
// Sends leads that no SuCasa pro can (or will) take to an external affiliate network.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TIMEOUT_MS = 10_000;

export type HandoffResult = {
  sent: boolean;
  partnerId?: string;
  partnerName?: string;
  handoffId?: string;
  reason?: string;
};

type PartnerRow = {
  id: string;
  name: string;
  endpoint_url: string;
  auth_type: string;
  secret_name: string | null;
  field_map: Record<string, string> | null;
  categories: string[];
  states: string[];
  metros: string[];
  priority: number;
  active: boolean;
};

/** Generic lead payload. `field_map` on the partner row renames keys to their spec. */
export function buildLeadPayload(req: {
  id: string;
  category: string;
  description: string | null;
  timeline: string | null;
  budget_min: number | null;
  budget_max: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}, owner: { full_name: string | null; phone: string | null; email: string | null } | null) {
  const first = (owner?.full_name ?? "").trim().split(/\s+/)[0] ?? "";
  const last = (owner?.full_name ?? "").trim().split(/\s+/).slice(1).join(" ");
  return {
    source: "sucasa",
    external_id: req.id,
    category: req.category,
    description: req.description ?? "",
    timeline: req.timeline ?? "",
    budget_min: req.budget_min,
    budget_max: req.budget_max,
    first_name: first,
    last_name: last,
    phone: owner?.phone ?? "",
    email: owner?.email ?? "",
    address: req.address ?? "",
    city: req.city ?? "",
    state: req.state ?? "",
    zip: req.zip ?? "",
    submitted_at: new Date().toISOString(),
  } as Record<string, unknown>;
}

function applyFieldMap(payload: Record<string, unknown>, map: Record<string, string> | null) {
  if (!map || !Object.keys(map).length) return payload;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) out[map[k] ?? k] = v;
  return out;
}

async function pickPartner(category: string, state: string | null, metro: string | null) {
  const { data, error } = await supabaseAdmin
    .from("lead_partners")
    .select("*")
    .eq("active", true)
    .order("priority", { ascending: true });
  if (error) throw error;
  const partners = (data ?? []) as unknown as PartnerRow[];
  return (
    partners.find((p) => {
      const catOk = !p.categories.length || p.categories.includes(category);
      const stateOk = !p.states.length || (state ? p.states.includes(state) : false);
      const metroOk = !p.metros.length || (metro ? p.metros.includes(metro) : false);
      return catOk && stateOk && metroOk;
    }) ?? null
  );
}

/** Hand a service request to the first matching active partner network. */
export async function handoffToPartner(requestId: string): Promise<HandoffResult> {
  const { data: req, error: reqErr } = await supabaseAdmin
    .from("service_requests")
    .select(
      "id, category, description, timeline, budget_min, budget_max, address, city, state, zip, metro, routing_status, homeowner_id",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw reqErr;
  if (!req) return { sent: false, reason: "request_not_found" };
  if (req.routing_status === "claimed" || req.routing_status === "cancelled") {
    return { sent: false, reason: `already_${req.routing_status}` };
  }

  // Don't double-send.
  const { data: prior } = await supabaseAdmin
    .from("lead_handoffs")
    .select("id, status")
    .eq("service_request_id", requestId)
    .eq("status", "sent")
    .maybeSingle();
  if (prior) return { sent: false, reason: "already_sent" };

  const partner = await pickPartner(req.category, req.state, req.metro);
  if (!partner) {
    await supabaseAdmin.from("service_requests").update({ routing_status: "unrouted" }).eq("id", requestId);
    return { sent: false, reason: "no_active_partner" };
  }

  const { data: owner } = await supabaseAdmin
    .from("profiles")
    .select("full_name, phone, email")
    .eq("id", req.homeowner_id)
    .maybeSingle();

  const payload = applyFieldMap(buildLeadPayload(req, owner ?? null), partner.field_map);

  const { data: handoff, error: hErr } = await supabaseAdmin
    .from("lead_handoffs")
    .insert({
      service_request_id: requestId,
      partner_id: partner.id,
      status: "pending",
      payload: payload as never,
    })
    .select("id, attempts")
    .single();
  if (hErr) throw hErr;

  const result = await postToPartner(partner, payload);

  await supabaseAdmin
    .from("lead_handoffs")
    .update({
      status: result.ok ? "sent" : "failed",
      http_status: result.status ?? null,
      partner_lead_id: result.partnerLeadId ?? null,
      error_message: result.error ?? null,
      response: (result.body ?? null) as never,
      attempts: (handoff.attempts ?? 0) + 1,
      sent_at: result.ok ? new Date().toISOString() : null,
    })
    .eq("id", handoff.id);

  await supabaseAdmin
    .from("service_requests")
    .update({ routing_status: result.ok ? "partner_sent" : "partner_failed" })
    .eq("id", requestId);

  // Mirror into GHL so the CRM stays the source of truth.
  try {
    await supabaseAdmin.rpc("enqueue_ghl_sync", {
      _entity_type: "service_request",
      _entity_id: requestId,
      _op: "upsert",
    });
  } catch (e) {
    console.error("GHL enqueue after handoff failed (non-fatal):", (e as Error).message);
  }

  return result.ok
    ? { sent: true, partnerId: partner.id, partnerName: partner.name, handoffId: handoff.id }
    : { sent: false, partnerId: partner.id, partnerName: partner.name, reason: result.error ?? "post_failed" };
}

async function postToPartner(partner: PartnerRow, payload: Record<string, unknown>) {
  const key = partner.secret_name ? process.env[partner.secret_name] : undefined;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) {
    if (partner.auth_type === "header") headers["X-API-Key"] = key;
    else if (partner.auth_type === "bearer") headers["Authorization"] = `Bearer ${key}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(partner.endpoint_url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep raw text */
    }
    const partnerLeadId =
      typeof body === "object" && body
        ? String(
            (body as Record<string, unknown>)["lead_id"] ??
              (body as Record<string, unknown>)["id"] ??
              "",
          ) || undefined
        : undefined;
    return {
      ok: res.ok,
      status: res.status,
      body,
      partnerLeadId,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, status: undefined, body: null, partnerLeadId: undefined, error: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/** Retry handoffs that previously failed. Called from the lead cron tick. */
export async function retryFailedHandoffs(limit = 10) {
  const { data } = await supabaseAdmin
    .from("service_requests")
    .select("id")
    .eq("routing_status", "partner_failed")
    .order("updated_at", { ascending: true })
    .limit(limit);
  let retried = 0;
  for (const r of data ?? []) {
    // Clear the failed row so handoffToPartner can create a fresh attempt.
    await supabaseAdmin
      .from("lead_handoffs")
      .delete()
      .eq("service_request_id", r.id)
      .eq("status", "failed");
    const res = await handoffToPartner(r.id);
    if (res.sent) retried++;
  }
  return retried;
}
