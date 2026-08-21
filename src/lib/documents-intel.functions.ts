import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Predicted actions + document facts for the signed-in homeowner. */
export const listHomeIntel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: actions }, { data: facts }] = await Promise.all([
      context.supabase
        .from("home_predicted_actions")
        .select(
          "id, action_key, title, why, system, service_category, urgency, due_from, due_by, est_cost_low_cents, est_cost_high_cents, status, document_id",
        )
        .eq("user_id", context.userId)
        .order("due_by", { ascending: true }),
      context.supabase
        .from("home_document_facts")
        .select("id, document_id, doc_kind, label, value, value_date, value_cents, system")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false }),
    ]);

    return { actions: actions ?? [], facts: facts ?? [] };
  });

const UpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "done", "dismissed"]),
});

export const updatePredictedAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateSchema.parse(i))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("home_predicted_actions")
      .update({
        status: data.status,
        completed_at: data.status === "done" ? now : null,
        dismissed_at: data.status === "dismissed" ? now : null,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
