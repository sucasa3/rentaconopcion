import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generatePlanWhy } from "@/lib/home-plan.server";

/** Stored cloud copy of the homeowner's current plan + per-item state. */
export const getHomePlanCloud = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [planRes, stateRes] = await Promise.all([
      context.supabase
        .from("home_plans")
        .select("source_hash, plan, ai_why, generated_at")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("home_plan_state")
        .select("item_key, state")
        .eq("user_id", context.userId),
    ]);

    const state: Record<string, "done" | "dismissed"> = {};
    for (const row of stateRes.data ?? []) {
      if (row.state === "done" || row.state === "dismissed") state[row.item_key] = row.state;
    }

    return {
      sourceHash: planRes.data?.source_hash ?? null,
      aiWhy: (planRes.data?.ai_why as Record<string, string> | null) ?? null,
      generatedAt: planRes.data?.generated_at ?? null,
      state,
    };
  });

const itemSchema = z.object({
  key: z.string().min(1).max(140),
  title: z.string().max(200),
  why: z.string().max(400),
  horizon: z.enum(["next90Days", "next12Months", "next3to5Years"]),
  costBand: z.object({ low: z.number(), high: z.number() }).nullable(),
  urgency: z.enum(["high", "medium", "low"]),
  category: z.string().max(60).nullable(),
  source: z.enum(["component", "finding", "seasonal", "review"]),
  targetYear: z.number().int().nullable().optional(),
});

/**
 * Persist the freshly computed plan. AI "why" sentences are generated once per
 * source hash and cached on the row — repeat saves with the same hash reuse them.
 */
export const saveHomePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sourceHash: z.string().min(1).max(40),
        language: z.enum(["en", "es"]).default("en"),
        homeCity: z.string().max(120).nullable().default(null),
        yearBuilt: z.number().int().nullable().default(null),
        items: z.array(itemSchema).max(30),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("home_plans")
      .select("source_hash, ai_why")
      .eq("user_id", userId)
      .maybeSingle();

    let aiWhy: Record<string, string> | null = null;
    if (existing?.source_hash === data.sourceHash && existing.ai_why) {
      aiWhy = existing.ai_why as Record<string, string>;
    } else {
      aiWhy = await generatePlanWhy(
        data.items.map((i) => ({
          key: i.key,
          title: i.title,
          why: i.why,
          horizon: i.horizon,
          targetYear: i.targetYear ?? null,
        })),
        { city: data.homeCity, yearBuilt: data.yearBuilt },
        data.language,
      );
    }

    await supabase.from("home_plans").upsert(
      {
        user_id: userId,
        source_hash: data.sourceHash,
        plan: { items: data.items },
        ai_why: aiWhy,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    return { aiWhy };
  });

/** Mark a plan item done or dismissed; `state: null` restores it. */
export const setHomePlanItemState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        itemKey: z.string().min(1).max(140),
        state: z.enum(["done", "dismissed"]).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.state === null) {
      await supabase
        .from("home_plan_state")
        .delete()
        .eq("user_id", userId)
        .eq("item_key", data.itemKey);
      return { ok: true };
    }
    await supabase.from("home_plan_state").upsert(
      {
        user_id: userId,
        item_key: data.itemKey,
        state: data.state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,item_key" },
    );
    return { ok: true };
  });
