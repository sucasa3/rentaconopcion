import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const assignHomeowners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    sourcePortfolioId: z.string().uuid(),
    clientIds: z.array(z.string().uuid()).min(1).max(500),
    targetUserId: z.string().uuid(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("assign_homeowners_to_member", {
      p_source: data.sourcePortfolioId,
      p_client_ids: data.clientIds,
      p_target_user: data.targetUserId,
    });
    if (error) throw new Error(error.message);
    return result as { assigned: number; targetPortfolioId: string };
  });