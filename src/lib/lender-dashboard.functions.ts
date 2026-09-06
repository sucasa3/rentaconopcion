import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** My Book, Homeowners Served and Permissioned Opportunities for one lender org. */
export const getLenderCommandCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let orgId = data.orgId ?? null;
    if (orgId) {
      const { data: isMember } = await supabase.rpc("is_lender_member", {
        _user_id: userId,
        _org_id: orgId,
      });
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (!isMember && !isAdmin) throw new Error("Forbidden");
    } else {
      const { data: members } = await supabase
        .from("lender_members")
        .select("lender_org_id, lender_orgs(id, org_type)")
        .eq("user_id", userId);
      const mine = (members ?? []).find((m: any) => m.lender_orgs?.org_type === "lender");
      orgId = mine?.lender_org_id ?? null;
      if (!orgId) {
        const { data: isAdmin } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: "admin",
        });
        if (isAdmin) {
          const { data: any1 } = await supabase
            .from("lender_orgs")
            .select("id")
            .eq("org_type", "lender")
            .limit(1);
          orgId = any1?.[0]?.id ?? null;
        }
      }
    }
    if (!orgId) return null;

    const { readLenderCommandCenter } = await import("./lender-dashboard.server");
    return { orgId, ...(await readLenderCommandCenter(orgId)) };
  });
