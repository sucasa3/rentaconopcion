import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: { rpc: (n: string, a: unknown) => Promise<{ data: unknown }> }; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

export const getPartnerOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [partnersRes, handoffsRes] = await Promise.all([
      supabaseAdmin
        .from("lead_partners")
        .select("id, name, endpoint_url, auth_type, secret_name, categories, states, metros, priority, active, payout_notes")
        .order("priority", { ascending: true }),
      supabaseAdmin
        .from("lead_handoffs")
        .select(
          "id, status, http_status, error_message, partner_lead_id, created_at, sent_at, service_request_id, lead_partners(name), service_requests!inner(category, city, state, zip)",
        )
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
    if (partnersRes.error) throw partnersRes.error;
    if (handoffsRes.error) throw handoffsRes.error;
    return { partners: partnersRes.data ?? [], handoffs: handoffsRes.data ?? [] };
  });

export const upsertPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        endpoint_url: z.string().url(),
        auth_type: z.enum(["bearer", "header", "none"]).default("bearer"),
        secret_name: z.string().max(256).nullable().optional(),
        categories: z.array(z.string()).default([]),
        states: z.array(z.string()).default([]),
        metros: z.array(z.string()).default([]),
        priority: z.number().int().min(1).max(999).default(100),
        active: z.boolean().default(false),
        payout_notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = { ...data, secret_name: data.secret_name || null, payout_notes: data.payout_notes || null };
    const { data: saved, error } = await supabaseAdmin
      .from("lead_partners")
      .upsert(row as never, { onConflict: "id" })
      .select("id")
      .single();
    if (error) throw error;
    return { id: saved.id };
  });

export const setPartnerActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; active: boolean }) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("lead_partners")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deletePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("lead_partners").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Manual "Send to partner" / "Retry" for a specific request. */
export const adminSendToPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("lead_handoffs")
      .delete()
      .eq("service_request_id", data.requestId)
      .eq("status", "failed");
    const { handoffToPartner } = await import("./partners.server");
    return handoffToPartner(data.requestId);
  });
