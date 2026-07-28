import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const logExternalSchema = z.object({
  category: z.string().trim().min(1).max(80),
  vendorName: z.string().trim().max(120).optional().nullable(),
  status: z.enum(["Completed", "Scheduled", "In Progress"]).default("Completed"),
  completedAt: z.string().datetime().optional().nullable(),
  amountCents: z.number().int().min(0).max(100_000_000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  receiptPath: z.string().trim().max(500).optional().nullable(),
});

export const logExternalService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => logExternalSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("service_requests")
      .insert({
        homeowner_id: userId,
        category: data.category,
        source: "external",
        status: data.status,
        vendor_name: data.vendorName ?? null,
        completed_at: data.completedAt ?? new Date().toISOString(),
        amount_cents: data.amountCents ?? null,
        notes: data.notes ?? null,
        receipt_path: data.receiptPath ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listMyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("service_requests")
      .select("id, category, status, source, vendor_name, amount_cents, completed_at, created_at")
      .eq("homeowner_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============ HOMEOWNER: CREATE SERVICE REQUEST ============
const createRequestSchema = z.object({
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).optional().nullable(),
  timeline: z.string().trim().max(80).optional().nullable(),
  budgetMin: z.number().int().min(0).max(1_000_000).optional().nullable(),
  budgetMax: z.number().int().min(0).max(1_000_000).optional().nullable(),
});

export const createServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Pull profile address so routing has geo
    const { data: profile } = await supabase
      .from("profiles")
      .select("address, city, state, zip")
      .eq("id", userId)
      .maybeSingle();
    const { data: row, error } = await supabase
      .from("service_requests")
      .insert({
        homeowner_id: userId,
        category: data.category,
        description: data.description ?? null,
        timeline: data.timeline ?? null,
        budget_min: data.budgetMin ?? null,
        budget_max: data.budgetMax ?? null,
        address: profile?.address ?? null,
        city: profile?.city ?? null,
        state: profile?.state ?? null,
        zip: profile?.zip ?? null,
        source: "homeowner",
        status: "open",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    // Kick round-robin routing (best-effort)
    try {
      const { offerNextPro } = await import("./leads.server");
      await offerNextPro(row.id);
    } catch (e) {
      console.error("Initial routing failed (non-fatal):", (e as Error).message);
    }
    return { id: row.id };
  });

// ============ HOMEOWNER: REQUEST DETAIL ============
export const getMyRequestDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req, error } = await supabase
      .from("service_requests")
      .select(
        "id, category, description, timeline, budget_min, budget_max, status, source, routing_status, address, city, state, zip, scheduled_at, invoice_path, invoice_cents, pro_notes, completed_at, cancelled_at, cancellation_reason, created_at, vendor_name, amount_cents, receipt_path",
      )
      .eq("id", data.id)
      .eq("homeowner_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!req) throw new Error("Request not found");

    // Assigned pro (if claimed)
    const { data: assignment } = await supabase
      .from("lead_assignments")
      .select(
        "id, claimed_at, pro_id, pros:pro_id(id, business_name, category, phone, email, rating, reviews_count)",
      )
      .eq("service_request_id", req.id)
      .maybeSingle();

    return { request: req, assignment: assignment ?? null };
  });

// ============ HOMEOWNER: CANCEL ============
export const cancelMyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason?: string }) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("service_requests")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: data.reason ?? null,
      })
      .eq("id", data.id)
      .eq("homeowner_id", userId);
    if (error) throw new Error(error.message);
    // Cancel any pending offers
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("lead_offers")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("service_request_id", data.id)
      .eq("status", "pending");
    return { ok: true };
  });

// ============ HOMEOWNER: CONFIRM COMPLETION ============
export const homeownerConfirmComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; receiptPath?: string }) =>
    z.object({ id: z.string().uuid(), receiptPath: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("service_requests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        ...(data.receiptPath ? { receipt_path: data.receiptPath } : {}),
      })
      .eq("id", data.id)
      .eq("homeowner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ PRO: LIFECYCLE ACTIONS ============
async function assertAssignedPro(context: { supabase: any; userId: string }, requestId: string) {
  const { data, error } = await context.supabase
    .from("lead_assignments")
    .select("id, pros!inner(user_id)")
    .eq("service_request_id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const pros = data?.pros as unknown as { user_id: string } | undefined;
  if (!pros || pros.user_id !== context.userId) throw new Error("Not the assigned pro");
}

export const proMarkScheduled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; scheduledAt: string }) =>
    z.object({ requestId: z.string().uuid(), scheduledAt: z.string().datetime() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAssignedPro(context, data.requestId);
    const { error } = await context.supabase
      .from("service_requests")
      .update({ status: "scheduled", scheduled_at: data.scheduledAt })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const proMarkInProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) =>
    z.object({ requestId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAssignedPro(context, data.requestId);
    const { error } = await context.supabase
      .from("service_requests")
      .update({ status: "in_progress" })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const proMarkCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    requestId: string;
    invoicePath?: string;
    invoiceCents?: number;
    proNotes?: string;
  }) =>
    z
      .object({
        requestId: z.string().uuid(),
        invoicePath: z.string().max(500).optional(),
        invoiceCents: z.number().int().min(0).max(100_000_000).optional(),
        proNotes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAssignedPro(context, data.requestId);
    const { error } = await context.supabase
      .from("service_requests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        invoice_path: data.invoicePath ?? null,
        invoice_cents: data.invoiceCents ?? null,
        pro_notes: data.proNotes ?? null,
      })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Signed URL for viewing an invoice (either pro or homeowner)
export const getInvoiceSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path: string }) =>
    z.object({ path: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("service-invoices")
      .createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
