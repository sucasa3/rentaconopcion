import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden: admin access required");
}

const ListSchema = z.object({
  search: z.string().trim().max(120).optional(),
  stage: z.string().trim().max(40).optional(),
  role: z.enum(["admin", "homeowner", "pro", "lender"]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const listAllProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 100;

    let q = supabaseAdmin
      .from("profiles")
      .select(
        "id, full_name, email, phone, city, state, zip, address, lifecycle_stage, last_activity_at, ghl_last_synced_at, created_at",
      )
      .order("last_activity_at", { ascending: false })
      .limit(limit);

    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(`email.ilike.%${s}%,full_name.ilike.%${s}%,city.ilike.%${s}%`);
    }
    if (data.stage) q = q.eq("lifecycle_stage", data.stage as any);

    const { data: profiles, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (profiles ?? []).map((p) => p.id);
    if (ids.length === 0) return { profiles: [] };

    const [{ data: roles }, { data: reqs }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("service_requests").select("homeowner_id").in("homeowner_id", ids),
    ]);

    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const list = roleMap.get(r.user_id) ?? [];
      list.push(r.role);
      roleMap.set(r.user_id, list);
    });
    const reqCount = new Map<string, number>();
    (reqs ?? []).forEach((r: any) => {
      reqCount.set(r.homeowner_id, (reqCount.get(r.homeowner_id) ?? 0) + 1);
    });

    let filtered = profiles ?? [];
    if (data.role) {
      filtered = filtered.filter((p) => (roleMap.get(p.id) ?? []).includes(data.role!));
    }

    return {
      profiles: filtered.map((p) => ({
        ...p,
        roles: roleMap.get(p.id) ?? [],
        request_count: reqCount.get(p.id) ?? 0,
      })),
    };
  });

const IdSchema = z.object({ userId: z.string().uuid() });

export const getProfileDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profile, roles, requests, consents, documents, sync] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role, created_at").eq("user_id", data.userId),
      supabaseAdmin
        .from("service_requests")
        .select("id, category, status, source, created_at, city, zip")
        .eq("homeowner_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("homeowner_lender_consents")
        .select("id, lender_org_id, scope, granted_at, revoked_at, lender_orgs(name)")
        .eq("homeowner_id", data.userId),
      supabaseAdmin
        .from("home_documents")
        .select("id, kind, original_filename, size_bytes, created_at, extraction_status, extraction_error, extracted_at")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("ghl_sync_state")
        .select("ghl_contact_id, ghl_opportunity_id, last_synced_at")
        .eq("entity_type", "homeowner")
        .eq("entity_id", data.userId)
        .maybeSingle(),
    ]);

    if (profile.error) throw new Error(profile.error.message);

    return {
      profile: profile.data,
      roles: roles.data ?? [],
      requests: requests.data ?? [],
      consents: consents.data ?? [],
      documents: documents.data ?? [],
      ghl: sync.data ?? null,
    };
  });

export const resyncProfileToGhl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("ghl_sync_queue")
      .insert({ entity_type: "homeowner", entity_id: data.userId, op: "upsert" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recomputeLifecycleStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: stage, error } = await supabaseAdmin.rpc("compute_lifecycle_stage", {
      _user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles")
      .update({ lifecycle_stage: stage as any, last_activity_at: new Date().toISOString() })
      .eq("id", data.userId);
    return { stage };
  });

const RoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "homeowner", "pro", "lender"]),
  action: z.enum(["grant", "revoke"]),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RoleSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.action === "grant") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role })
        .select();
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
