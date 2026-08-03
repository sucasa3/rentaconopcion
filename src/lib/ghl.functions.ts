import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Drain queue: process pending sync jobs (homeowners, pros, claimed leads).
// Called by cron and admin.
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
      .select("id, entity_type, entity_id, attempts")
      .is("processed_at", null)
      .lt("attempts", 5)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    if (!jobs?.length) return { processed: 0, skipped: 0, errors: 0 };

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    const markDone = (id: string) =>
      supabaseAdmin
        .from("ghl_sync_queue")
        .update({ processed_at: new Date().toISOString(), last_error: null })
        .eq("id", id);

    for (const job of jobs) {
      try {
        if (job.entity_type === "homeowner") {
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
          await markDone(job.id);
          processed++;
        } else if (job.entity_type === "pro") {
          const { data: pro } = await supabaseAdmin
            .from("pros")
            .select("id, business_name, email, phone, category, plan, subscription_status, language")
            .eq("id", job.entity_id)
            .maybeSingle();
          if (!pro) throw new Error(`Pro ${job.entity_id} not found`);

          const { data: coverage } = await supabaseAdmin
            .from("pro_coverage")
            .select("metro")
            .eq("pro_id", pro.id);
          const metros = Array.from(
            new Set((coverage ?? []).map((c) => c.metro).filter((m): m is string => !!m)),
          );

          const contactId = await ghl.upsertProContact({
            proId: pro.id,
            businessName: pro.business_name,
            email: pro.email,
            phone: pro.phone,
            category: pro.category,
            metros,
            plan: pro.plan,
            subscriptionStatus: pro.subscription_status,
            language: pro.language,
          });

          await supabaseAdmin.from("ghl_sync_state").upsert(
            {
              entity_type: "pro",
              entity_id: pro.id,
              ghl_contact_id: contactId,
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: "entity_type,entity_id" },
          );
          await supabaseAdmin.from("pros").update({ ghl_contact_id: contactId }).eq("id", pro.id);
          await markDone(job.id);
          processed++;
        } else if (job.entity_type === "service_request" || job.entity_type === "claim") {
          // Leads only reach GHL once a pro has claimed them.
          let requestId = job.entity_id;
          let proId: string | null = null;

          if (job.entity_type === "claim") {
            const { data: claim } = await supabaseAdmin
              .from("claims")
              .select("request_id, pro_id, status")
              .eq("id", job.entity_id)
              .maybeSingle();
            if (!claim || claim.status !== "accepted") {
              await markDone(job.id);
              skipped++;
              continue;
            }
            requestId = claim.request_id;
            proId = claim.pro_id;
          } else {
            const { data: assignment } = await supabaseAdmin
              .from("lead_assignments")
              .select("pro_id")
              .eq("service_request_id", job.entity_id)
              .maybeSingle();
            proId = assignment?.pro_id ?? null;
          }

          if (!proId) {
            // Not claimed yet — no-op; a claim will re-enqueue it.
            await markDone(job.id);
            skipped++;
            continue;
          }

          const oppId = await ghl.createServiceLeadOpportunity(requestId, proId);
          await supabaseAdmin.from("ghl_sync_state").upsert(
            {
              entity_type: "service_request",
              entity_id: requestId,
              ghl_opportunity_id: oppId,
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: "entity_type,entity_id" },
          );
          await markDone(job.id);
          processed++;
        } else {
          await markDone(job.id);
          skipped++;
        }
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
    return { processed, skipped, errors };
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
    await supabaseAdmin.rpc("enqueue_ghl_sync", {
      _entity_type: "homeowner",
      _entity_id: data.userId,
      _op: "upsert",
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
