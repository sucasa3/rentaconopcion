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
  /** Who entered it. Agent entries are never presented as homeowner-confirmed. */
  enteredByRole: "homeowner" | "agent";
  entryKind: "added" | "updated";
};

/** Serializable snapshot of one saved system entry. */
export type SystemValue = Record<string, string | number | boolean | null>;

export type HomeSystemChange = {
  componentKey: string;
  version: number;
  actorRole: "homeowner" | "agent";
  changeKind: "added" | "updated" | "removed";
  oldValue: SystemValue | null;
  newValue: SystemValue | null;
  createdAt: string;
};

export const SystemFields = z.object({
  componentKey: z.string().min(2).max(40),
  action: z.enum(["replaced", "serviced"]).default("replaced"),
  installedYear: z.number().int().min(1900).max(2100).nullable().optional(),
  servicedOn: z.string().min(4).max(10).nullable().optional(),
  brand: z.string().max(80).nullable().optional(),
  model: z.string().max(80).nullable().optional(),
  warrantyYears: z.number().int().min(0).max(50).nullable().optional(),
  provider: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  /** Version the editor saw; a newer save since then is refused (conflict). */
  expectedVersion: z.number().int().min(0).nullable().optional(),
});

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; error: string; code: "conflict" | "forbidden" | "error"; version?: number };

/** Shared RPC arg builder for both editing paths. */
export function rpcArgs(homeowner: string, orgId: string | null, d: z.infer<typeof SystemFields>) {
  const n = <T,>(v: T | null | undefined) => (v ?? null) as unknown as T;
  return {
    p_homeowner: homeowner,
    p_component_key: d.componentKey,
    p_org_id: n<string>(orgId),
    p_expected_version: n<number>(d.expectedVersion),
    p_action: d.action,
    p_installed_year: n<number>(d.installedYear),
    p_serviced_on: n<string>(d.servicedOn),
    p_brand: n<string>(d.brand),
    p_model: n<string>(d.model),
    p_warranty_years: n<number>(d.warrantyYears),
    p_provider: n<string>(d.provider),
    p_notes: n<string>(d.notes),
  };
}

export function toSaveResult(data: unknown, error: unknown): SaveResult {
  const r = (data ?? {}) as { ok?: boolean; error?: string; version?: number };
  if (error || !r.ok) {
    if (r.error === "conflict")
      return { ok: false, code: "conflict", error: "conflict", version: r.version };
    if (r.error === "forbidden" || r.error === "unauthorized")
      return { ok: false, code: "forbidden", error: "forbidden" };
    return { ok: false, code: "error", error: "Could not save that service record" };
  }
  return { ok: true, version: r.version ?? 0 };
}

/** Everything the signed-in homeowner has logged about their home's systems. */
export const getMyComponentServiceLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("home_component_service_log")
      .select(
        "id, component_key, action, installed_year, serviced_on, brand, model, warranty_years, provider, notes, created_at, entered_by_role, entry_kind",
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
      enteredByRole: (r.entered_by_role === "agent" ? "agent" : "homeowner") as
        | "homeowner"
        | "agent",
      entryKind: (r.entry_kind === "updated" ? "updated" : "added") as "added" | "updated",
    })) satisfies ComponentServiceEntry[];
  });

/** Current version per system plus recent change history, for the homeowner. */
export const getMyHomeSystemState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: versions }, { data: history }] = await Promise.all([
      context.supabase
        .from("home_system_versions")
        .select("component_key, version")
        .eq("homeowner_user_id", context.userId),
      context.supabase
        .from("home_system_changes")
        .select("component_key, version, actor_role, change_kind, old_value, new_value, created_at")
        .eq("homeowner_user_id", context.userId)
        .not("component_key", "like", "seasonal:%")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const v: Record<string, number> = {};
    for (const r of versions ?? []) v[r.component_key] = r.version;
    return {
      versions: v,
      history: (history ?? []).map((h) => ({
        componentKey: h.component_key,
        version: h.version,
        actorRole: h.actor_role as "homeowner" | "agent",
        changeKind: h.change_kind as HomeSystemChange["changeKind"],
        oldValue: (h.old_value ?? null) as SystemValue | null,
        newValue: (h.new_value ?? null) as SystemValue | null,
        createdAt: h.created_at,
      })) satisfies HomeSystemChange[],
    };
  });

/** Homeowner saves a system update (versioned, with history, atomically). */
export const logComponentService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SystemFields.parse(input))
  .handler(async ({ data, context }): Promise<SaveResult> => {
    // Seasonal check-offs are append-only; the database skips the version check for them.
    const d = data;
    const { data: res, error } = await context.supabase.rpc(
      "save_home_system",
      rpcArgs(context.userId, null, d),
    );
    return toSaveResult(res, error);
  });

/** Undo a logged service record (homeowner only, recorded in history). */
export const deleteComponentService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("delete_home_system_entry", {
      p_log_id: data.id,
    });
    if (error || !(res as { ok?: boolean })?.ok)
      return { ok: false as const, error: "Could not remove that record" };
    return { ok: true as const };
  });

export type HomeSystemAccessOption = {
  orgId: string;
  orgName: string;
  memberCount: number;
  enabled: boolean;
  grantedAt: string | null;
};

/** Agent workspaces this homeowner could let view/update their home systems. */
export const listHomeSystemAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("list_home_system_access_options");
    return ((data ?? []) as any[]).map((r) => ({
      orgId: r.org_id,
      orgName: r.org_name,
      memberCount: r.member_count,
      enabled: !!r.enabled,
      grantedAt: r.granted_at ?? null,
    })) satisfies HomeSystemAccessOption[];
  });

/** Only the signed-in homeowner can turn this on or off. */
export const setHomeSystemAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ orgId: z.string().uuid(), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("set_home_system_access", {
      p_org_id: data.orgId,
      p_enabled: data.enabled,
    });
    return { ok: !error && !!(res as { ok?: boolean })?.ok };
  });
