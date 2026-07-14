import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

// List pros + their metro coverage for the seed panel.
export const listProsWithCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pros } = await supabaseAdmin
      .from("pros")
      .select("id, business_name, category, phone, email, is_founding_partner, accepting_leads, active, monthly_price_cents")
      .order("created_at", { ascending: false });
    const { data: coverage } = await supabaseAdmin
      .from("pro_coverage")
      .select("id, pro_id, category, metro, zip")
      .not("metro", "is", null);
    return { pros: pros ?? [], coverage: coverage ?? [] };
  });

// Create a pro row (no linked user yet) plus one or more (category, metro) coverage rows.
export const seedPro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    business_name: string;
    primary_category: string;
    phone?: string;
    email?: string;
    is_founding_partner?: boolean;
    monthly_price_cents?: number;
    coverage: { category: string; metro: string }[];
  }) =>
    z.object({
      business_name: z.string().min(2).max(120),
      primary_category: z.string().min(1),
      phone: z.string().max(40).optional(),
      email: z.string().email().max(200).optional(),
      is_founding_partner: z.boolean().optional(),
      monthly_price_cents: z.number().int().min(0).max(1_000_000).optional(),
      coverage: z.array(z.object({
        category: z.string().min(1),
        metro: z.string().min(2).max(120),
      })).min(1).max(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pro, error } = await supabaseAdmin
      .from("pros")
      .insert({
        business_name: data.business_name,
        category: data.primary_category,
        phone: data.phone ?? null,
        email: data.email ?? null,
        is_founding_partner: !!data.is_founding_partner,
        monthly_price_cents: data.monthly_price_cents ?? (data.is_founding_partner ? 29700 : 39700),
        accepting_leads: true,
        active: true,
      })
      .select("id")
      .single();
    if (error) throw error;

    const rows = data.coverage.map((c) => ({ pro_id: pro.id, category: c.category, metro: c.metro }));
    const { error: covErr } = await supabaseAdmin.from("pro_coverage").insert(rows);
    if (covErr) throw covErr;

    return { pro_id: pro.id };
  });

export const addCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pro_id: string; category: string; metro: string }) =>
    z.object({
      pro_id: z.string().uuid(),
      category: z.string().min(1),
      metro: z.string().min(2).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("pro_coverage").insert(data);
    if (error) throw error;
    return { ok: true };
  });

export const removeCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("pro_coverage").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const setProFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pro_id: string; is_founding_partner?: boolean; accepting_leads?: boolean; active?: boolean }) =>
    z.object({
      pro_id: z.string().uuid(),
      is_founding_partner: z.boolean().optional(),
      accepting_leads: z.boolean().optional(),
      active: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      is_founding_partner?: boolean;
      monthly_price_cents?: number;
      accepting_leads?: boolean;
      active?: boolean;
    } = {};
    if (data.is_founding_partner !== undefined) {
      patch.is_founding_partner = data.is_founding_partner;
      patch.monthly_price_cents = data.is_founding_partner ? 29700 : 39700;
    }
    if (data.accepting_leads !== undefined) patch.accepting_leads = data.accepting_leads;
    if (data.active !== undefined) patch.active = data.active;
    const { error } = await supabaseAdmin.from("pros").update(patch).eq("id", data.pro_id);
    if (error) throw error;
    return { ok: true };
  });
