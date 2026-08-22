import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isManagerOfAny(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return true;
  const { data: members } = await supabase
    .from("lender_members")
    .select("role")
    .eq("user_id", userId);
  return (members ?? []).some((m: any) => ["owner", "admin", "manager"].includes(m.role));
}

/** Manually scan connected agent/lender books and create shared opportunities. */
export const syncSharedOpportunities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ connectionId: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const canManage = await isManagerOfAny(context.supabase, context.userId);
    if (!canManage) throw new Error("Only organization managers can sync shared opportunities.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncSharedOpportunities: sync } = await import("@/lib/shared-opportunities.server");
    return sync(supabaseAdmin, { connectionId: data.connectionId });
  });
