import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Everything on this agent's or lender's plate right now. */
export const getMyBusinessTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgType: z.enum(["agent", "lender"]) }).parse(i))
  .handler(async ({ data, context }) => {
    const { buildBusinessTasks } = await import("@/lib/tasks.server");
    return buildBusinessTasks(context.supabase, context.userId, data.orgType);
  });

/** Check a task off (or put it back). Never touches the underlying record. */
export const setBusinessTaskDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        taskKey: z.string().min(1).max(200),
        done: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!data.done) {
      const { error } = await context.supabase
        .from("business_task_state")
        .delete()
        .eq("user_id", context.userId)
        .eq("org_id", data.orgId)
        .eq("task_key", data.taskKey);
      if (error) return { ok: false as const, error: "Could not reopen that task" };
      return { ok: true as const };
    }

    const { error } = await context.supabase.from("business_task_state").upsert(
      {
        user_id: context.userId,
        org_id: data.orgId,
        task_key: data.taskKey,
        status: "done",
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,org_id,task_key" },
    );
    if (error) return { ok: false as const, error: "Could not save that just now" };
    return { ok: true as const };
  });
