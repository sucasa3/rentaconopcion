import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Returns the signed-in user's pro account (if any) + coverage.
export const getMyProAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: pro } = await context.supabase
      .from("pros")
      .select(
        "id, business_name, category, phone, email, active, accepting_leads, is_founding_partner, monthly_price_cents, subscription_status, subscription_activated_at, language",
      )
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!pro) return { pro: null, coverage: [] as { id: string; category: string; metro: string | null }[] };
    const { data: coverage } = await context.supabase
      .from("pro_coverage")
      .select("id, category, metro")
      .eq("pro_id", pro.id);
    return { pro, coverage: coverage ?? [] };
  });

const SignupInput = z.object({
  business_name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(7).max(40),
  email: z.string().trim().email().max(200),
  language: z.enum(["en", "es"]).default("en"),
  coverage: z
    .array(z.object({ category: z.string().min(1).max(60), metro: z.string().min(2).max(120) }))
    .min(1)
    .max(30),
});

// Self-serve pro signup. Creates a pending (inactive) pro record — leads only
// route once billing activates it via the GHL billing webhook.
export const createProAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SignupInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("pros")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) throw new Error("You already have a pro account.");

    // Founding partner pricing for the first 3 pros.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("pros")
      .select("id", { count: "exact", head: true })
      .eq("is_founding_partner", true);
    const founding = (count ?? 0) < 3;

    const { data: pro, error } = await context.supabase
      .from("pros")
      .insert({
        user_id: context.userId,
        business_name: data.business_name,
        category: data.category,
        phone: data.phone,
        email: data.email,
        language: data.language,
        is_founding_partner: founding,
        monthly_price_cents: founding ? 29700 : 39700,
        subscription_status: "pending",
        accepting_leads: false,
        active: false,
      })
      .select("id, monthly_price_cents, is_founding_partner")
      .single();
    if (error) throw error;

    const rows = data.coverage.map((c) => ({ pro_id: pro.id, category: c.category, metro: c.metro }));
    await context.supabase.from("pro_coverage").insert(rows);

    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "pro" })
      .select("id")
      .maybeSingle();

    return {
      pro_id: pro.id,
      is_founding_partner: pro.is_founding_partner,
      monthly_price_cents: pro.monthly_price_cents,
    };
  });

export const updateMyProProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        phone: z.string().trim().min(7).max(40).optional(),
        email: z.string().trim().email().max(200).optional(),
        accepting_leads: z.boolean().optional(),
        language: z.enum(["en", "es"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("pros").update(data).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
