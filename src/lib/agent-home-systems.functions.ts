import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SystemFields, rpcArgs, toSaveResult, type SaveResult, type SystemValue } from "@/lib/home-maintenance.functions";

/**
 * Agent view/update of a client's home systems. Access exists only while the
 * homeowner's own grant for this agent workspace is active; every read and
 * save re-checks membership + grant + client link inside the database.
 */

async function orgForPortfolio(supabase: any, portfolioId: string): Promise<string | null> {
  const { data } = await supabase
    .from("lender_portfolios")
    .select("lender_org_id")
    .eq("id", portfolioId)
    .maybeSingle();
  return (data?.lender_org_id as string | undefined) ?? null;
}

export type AgentHomeSystems =
  | { allowed: false; reason: "not_member" | "no_account" | "no_permission" }
  | {
      allowed: true;
      entries: Array<{
        id: string;
        component_key: string;
        action: string;
        installed_year: number | null;
        brand: string | null;
        model: string | null;
        warranty_years: number | null;
        provider: string | null;
        notes: string | null;
        created_at: string;
        entered_by_role: string;
        entry_kind: string;
      }>;
      versions: Record<string, number>;
      history: Array<{
        component_key: string;
        version: number;
        actor_role: string;
        change_kind: string;
        old_value: SystemValue | null;
        new_value: SystemValue | null;
        created_at: string;
        by_this_workspace: boolean | null;
      }>;
    };

const Target = z.object({ portfolioId: z.string().uuid(), clientId: z.string().uuid() });

export const getClientHomeSystems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Target.parse(i))
  .handler(async ({ data, context }): Promise<AgentHomeSystems> => {
    const orgId = await orgForPortfolio(context.supabase, data.portfolioId);
    if (!orgId) return { allowed: false, reason: "not_member" };
    const { data: res } = await context.supabase.rpc("get_home_systems_for_agent", {
      p_org_id: orgId,
      p_client_id: data.clientId,
    });
    const r = (res ?? { allowed: false, reason: "no_permission" }) as any;
    if (!r.allowed) return { allowed: false, reason: r.reason ?? "no_permission" };
    // Never pass the homeowner id or actor ids back to the browser.
    const strip = (v: any) => {
      if (!v || typeof v !== "object") return v ?? null;
      const { entered_by_user_id: _a, entered_by_org_id: _b, user_id: _c, ...rest } = v;
      return rest;
    };
    return {
      allowed: true,
      entries: (r.entries ?? []).map(strip),
      versions: r.versions ?? {},
      history: (r.history ?? []).map((h: any) => ({
        ...h,
        old_value: strip(h.old_value),
        new_value: strip(h.new_value),
      })),
    };
  });

export const saveClientHomeSystem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Target.merge(SystemFields).parse(i))
  .handler(async ({ data, context }): Promise<SaveResult> => {
    if (data.componentKey.startsWith("seasonal:"))
      return { ok: false, code: "forbidden", error: "forbidden" };
    const orgId = await orgForPortfolio(context.supabase, data.portfolioId);
    if (!orgId) return { ok: false, code: "forbidden", error: "forbidden" };
    const { data: access } = await context.supabase.rpc("get_home_systems_for_agent", {
      p_org_id: orgId,
      p_client_id: data.clientId,
    });
    const a = access as any;
    if (!a?.allowed || !a.homeowner) return { ok: false, code: "forbidden", error: "forbidden" };
    const { data: res, error } = await context.supabase.rpc(
      "save_home_system",
      rpcArgs(a.homeowner, orgId, data),
    );
    return toSaveResult(res, error);
  });
