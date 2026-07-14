import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const logExternalSchema = z.object({
  category: z.string().trim().min(1).max(80),
  vendorName: z.string().trim().max(120).optional().nullable(),
  status: z.enum(["Completed", "Scheduled", "In Progress"]).default("Completed"),
  completedAt: z.string().datetime().optional().nullable(),
  amountCents: z.number().int().min(0).max(100_000_000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  receiptPath: z.string().trim().max(500).optional().nullable(),
});

export const logExternalService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => logExternalSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("service_requests")
      .insert({
        homeowner_id: userId,
        category: data.category,
        source: "external",
        status: data.status,
        vendor_name: data.vendorName ?? null,
        completed_at: data.completedAt ?? new Date().toISOString(),
        amount_cents: data.amountCents ?? null,
        notes: data.notes ?? null,
        receipt_path: data.receiptPath ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listMyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("service_requests")
      .select("id, category, status, source, vendor_name, amount_cents, completed_at, created_at")
      .eq("homeowner_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
