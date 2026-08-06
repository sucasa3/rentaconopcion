import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ComponentServiceEntry = {
  id: string;
  componentKey: string;
  action: "replaced" | "serviced";
  installedYear: number | null;
  servicedOn: string | null;
  brand: string | null;
  model: string | null;
  warrantyYears: number | null;
  provider: string | null;
  notes: string | null;
  createdAt: string;
};

const LogInput = z.object({
  componentKey: z.string().min(2).max(40),
  action: z.enum(["replaced", "serviced"]).default("replaced"),
  installedYear: z.number().int().min(1900).max(2100).nullable().optional(),
  servicedOn: z.string().min(4).max(10).nullable().optional(),
  brand: z.string().max(80).nullable().optional(),
  model: z.string().max(80).nullable().optional(),
  warrantyYears: z.number().int().min(0).max(50).nullable().optional(),
  provider: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

/** Everything the signed-in homeowner has logged about their home's systems. */
export const getMyComponentServiceLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("home_component_service_log")
      .select(
        "id, component_key, action, installed_year, serviced_on, brand, model, warranty_years, provider, notes, created_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) return [] as ComponentServiceEntry[];

    return (data ?? []).map((r) => ({
      id: r.id,
      componentKey: r.component_key,
      action: (r.action === "serviced" ? "serviced" : "replaced") as "replaced" | "serviced",
      installedYear: r.installed_year,
      servicedOn: r.serviced_on,
      brand: r.brand,
      model: r.model,
      warrantyYears: r.warranty_years,
      provider: r.provider,
      notes: r.notes,
      createdAt: r.created_at,
    })) satisfies ComponentServiceEntry[];
  });

/** Homeowner marks a maintenance item done and records the new system's details. */
export const logComponentService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => LogInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("home_component_service_log").insert({
      user_id: context.userId,
      component_key: data.componentKey,
      action: data.action,
      installed_year: data.installedYear ?? null,
      serviced_on: data.servicedOn ?? null,
      brand: data.brand ?? null,
      model: data.model ?? null,
      warranty_years: data.warrantyYears ?? null,
      provider: data.provider ?? null,
      notes: data.notes ?? null,
    });
    if (error) return { ok: false as const, error: "Could not save that service record" };
    return { ok: true as const };
  });

/** Undo a logged service record. */
export const deleteComponentService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("home_component_service_log")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) return { ok: false as const, error: "Could not remove that record" };
    return { ok: true as const };
  });
