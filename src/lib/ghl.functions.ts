import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Drain queue: process pending homeowner sync jobs. Called by cron and admin.
export const drainGhlQueue = createServerFn({ method: "POST" })
  .inputValidator((d: { limit?: number } | undefined) =>
    z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ghl = await import("./ghl.server");
    const limit = data.limit ?? 20;

    const { data: jobs, error } = await supabaseAdmin
      .from("ghl_sync_queue")
      .select("id, entity_id, attempts")
      .eq("entity_type", "homeowner")
      .is("processed_at", null)
      .lt("attempts", 5)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    if (!jobs?.length) return { processed: 0, errors: 0 };

    let processed = 0;
    let errors = 0;

    for (const job of jobs) {
      try {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, phone, city, state, lifecycle_stage, language")
          .eq("id", job.entity_id)
          .maybeSingle();
        if (!profile) throw new Error(`Profile ${job.entity_id} not found`);

        const contactId = await ghl.upsertContact({
          userId: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          phone: profile.phone,
          city: profile.city,
          state: profile.state,
          stage: profile.lifecycle_stage,
          language: profile.language,
        });
        const oppId = await ghl.moveToStage(contactId, profile.lifecycle_stage, profile.full_name);

        await supabaseAdmin.from("ghl_sync_state").upsert(
          {
            entity_type: "homeowner",
            entity_id: profile.id,
            ghl_contact_id: contactId,
            ghl_opportunity_id: oppId,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "entity_type,entity_id" },
        );
        await supabaseAdmin
          .from("profiles")
          .update({ ghl_last_synced_at: new Date().toISOString() })
          .eq("id", profile.id);
        await supabaseAdmin
          .from("ghl_sync_queue")
          .update({ processed_at: new Date().toISOString(), last_error: null })
          .eq("id", job.id);
        processed++;
      } catch (e) {
        errors++;
        await supabaseAdmin
          .from("ghl_sync_queue")
          .update({
            attempts: (job.attempts ?? 0) + 1,
            last_error: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
          })
          .eq("id", job.id);
      }
    }
    return { processed, errors };
  });

// Enqueue a manual resync for one homeowner (admin only).
export const resyncHomeowner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    await supabaseAdmin.from("ghl_sync_queue").insert({
      entity_type: "homeowner",
      entity_id: data.userId,
      op: "upsert",
    });
    return { queued: true };
  });

// Backfill every homeowner into the queue.
export const backfillGhl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { data: rows } = await supabaseAdmin.from("profiles").select("id");
    if (!rows?.length) return { queued: 0 };
    const { error } = await supabaseAdmin
      .from("ghl_sync_queue")
      .insert(rows.map((r) => ({ entity_type: "homeowner", entity_id: r.id, op: "upsert" })));
    if (error) throw error;
    return { queued: rows.length };
  });

// Add a note to a homeowner's GHL contact (called from milestones).
export const addHomeownerNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { note: string }) => z.object({ note: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ghl = await import("./ghl.server");
    const { data: state } = await supabaseAdmin
      .from("ghl_sync_state")
      .select("ghl_contact_id")
      .eq("entity_type", "homeowner")
      .eq("entity_id", context.userId)
      .maybeSingle();
    if (!state?.ghl_contact_id) return { added: false, reason: "no_contact" };
    await ghl.addContactNote(state.ghl_contact_id, data.note);
    return { added: true };
  });

// Read-only admin: queue depth + recent failures.
export const getGhlSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const [pending, failed] = await Promise.all([
      supabaseAdmin
        .from("ghl_sync_queue")
        .select("id", { count: "exact", head: true })
        .is("processed_at", null),
      supabaseAdmin
        .from("ghl_sync_queue")
        .select("id, entity_id, attempts, last_error, created_at")
        .not("last_error", "is", null)
        .is("processed_at", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    return {
      pending: pending.count ?? 0,
      failed: failed.data ?? [],
    };
  });
