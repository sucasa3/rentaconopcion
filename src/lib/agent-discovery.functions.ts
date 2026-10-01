import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

/** Everything the Agent Discovery screen needs, read server-side. */
export const getAgentDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ portfolioId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { requireAgentBook, smsConfigured } = await import("./agent-discovery.server");
    const { orgId, org } = await requireAgentBook(context.supabase, context.userId, data.portfolioId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const [{ data: run }, { data: ledger }, { data: identity }, { data: base }, { data: plans }, { count: active }] =
      await Promise.all([
        db.from("agent_discovery_runs").select("report, pending_rows, needs_address, updated_at").eq("portfolio_id", data.portfolioId).maybeSingle(),
        db.from("agent_credit_ledger").select("kind, delta").eq("org_id", orgId),
        db.from("agent_identity").select("phone_last4, phone_verified_at, license_state").eq("user_id", context.userId).maybeSingle(),
        db.from("agent_base_entitlements").select("profile_limit").eq("org_id", orgId).maybeSingle(),
        db.from("plan_tiers").select("key, name, price_cents, profile_allowance, stripe_price_id, stripe_test_price_id").in("key", ["agent", "agent_growth"]).eq("active", true),
        db.from("lender_portfolio_clients").select("id, lender_portfolios!inner(lender_org_id)", { count: "exact", head: true }).eq("lender_portfolios.lender_org_id", orgId).is("archived_at", null),
      ]);

    const rows = (ledger ?? []) as { kind: string; delta: number }[];
    const remaining = rows.reduce((s, r) => s + r.delta, 0);
    const granted = rows.filter((r) => r.kind !== "spend" && r.kind !== "refund").reduce((s, r) => s + r.delta, 0);
    const hasFree = rows.some((r) => r.kind === "base" || r.kind === "sponsor") || Boolean(base);

    const { buildActionQueue } = await import("./nba.server");
    let top: { clientId: string; name: string; categoryLabel: string; why: string; headline: string }[] = [];
    try {
      const q = await buildActionQueue(context.supabase, context.userId, "agent", 60);
      top = q.items
        .filter((i) => i.portfolioId === data.portfolioId)
        .slice(0, 3)
        .map((i) => ({ clientId: i.clientId, name: i.name, categoryLabel: i.categoryLabel, why: i.why, headline: i.headline }));
    } catch {
      top = [];
    }

    const { priceIdColumn, currentStripeMode } = await import("./billing.server");
    const column = priceIdColumn(await currentStripeMode());

    return {
      orgId,
      planKey: org?.plan_key ?? null,
      subscriptionStatus: org?.subscription_status ?? null,
      capacity: { total: Math.max(granted, 0), remaining, active: active ?? 0, hasFree },
      report: (run as any)?.report ?? null,
      pendingCount: ((run as any)?.pending_rows ?? []).length,
      needsAddress: ((run as any)?.needs_address ?? []) as { full_name: string; email: string | null }[],
      identity: identity
        ? { phoneLast4: (identity as any).phone_last4, verified: Boolean((identity as any).phone_verified_at) }
        : null,
      smsReady: smsConfigured(),
      top,
      plans: (plans ?? [])
        .map((p: any) => ({
          key: p.key as string,
          name: p.name as string,
          priceCents: p.price_cents as number,
          profiles: p.profile_allowance as number,
          purchasable: Boolean(p[column]),
        }))
        .sort((a: any, b: any) => a.priceCents - b.priceCents),
    };
  });

export const uploadAgentDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ portfolioId: uuid, csv: z.string().min(1).max(2_000_000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { requireAgentBook, runAgentDiscovery } = await import("./agent-discovery.server");
    const { orgId } = await requireAgentBook(context.supabase, context.userId, data.portfolioId);
    const report = await runAgentDiscovery({ userId: context.userId, orgId, portfolioId: data.portfolioId, csv: data.csv });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logNetworkEvent } = await import("./network-events.server");
    await logNetworkEvent(supabaseAdmin, {
      action: "agent_discovery_uploaded",
      actorUserId: context.userId,
      orgId,
      entityType: "agent_portfolio",
      entityId: data.portfolioId,
      metadata: { ...report },
    });
    return report;
  });

/** Confirmed by the agent after an upgrade. Repeating it never duplicates. */
export const importAgentPending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ portfolioId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { requireAgentBook, importPendingRows } = await import("./agent-discovery.server");
    const { orgId } = await requireAgentBook(context.supabase, context.userId, data.portfolioId);
    const res = await importPendingRows(orgId, data.portfolioId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logNetworkEvent } = await import("./network-events.server");
    await logNetworkEvent(supabaseAdmin, {
      action: "agent_pending_import_completed",
      actorUserId: context.userId,
      orgId,
      entityType: "agent_portfolio",
      entityId: data.portfolioId,
      metadata: res,
    });
    return res;
  });

/** Agent upgrade: existing Stripe checkout, restricted to the two active agent plans. */
export const startAgentUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ portfolioId: uuid, planKey: z.enum(["agent", "agent_growth"]), returnUrl: z.string().url() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { requireAgentBook } = await import("./agent-discovery.server");
    const { orgId } = await requireAgentBook(context.supabase, context.userId, data.portfolioId);
    const { data: manager } = await context.supabase.rpc("is_lender_manager", { _user_id: context.userId, _org_id: orgId });
    if (!manager) throw new Error("Only the account owner can change the plan.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { ensureCustomer, stripeRequest, priceIdColumn, currentStripeMode } = await import("./billing.server");
    const mode = await currentStripeMode();
    const { data: plan } = await db.from("plan_tiers").select("key, stripe_price_id, stripe_test_price_id").eq("key", data.planKey).eq("active", true).maybeSingle();
    const priceId = plan ? plan[priceIdColumn(mode)] : null;
    if (!priceId) throw new Error("This plan isn't available for purchase yet.");
    const { data: org } = await db.from("lender_orgs").select("id, name, primary_contact_email, stripe_customer_id, stripe_test_customer_id, stripe_subscription_id, subscription_status").eq("id", orgId).maybeSingle();

    const customer = await ensureCustomer(db, org, mode);
    const session = await stripeRequest<{ id: string; url: string }>(
      "/checkout/sessions",
      "POST",
      {
        mode: "subscription",
        customer,
        client_reference_id: orgId,
        success_url: `${data.returnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${data.returnUrl}?checkout=cancelled`,
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: { metadata: { sucasa_org_id: orgId } },
        metadata: { sucasa_org_id: orgId, plan_key: data.planKey },
      },
      mode,
    );
    const { logNetworkEvent } = await import("./network-events.server");
    await logNetworkEvent(db, {
      action: "agent_upgrade_checkout_started",
      actorUserId: context.userId,
      orgId,
      entityType: "agent_organization",
      entityId: orgId,
      metadata: { plan_key: data.planKey },
    });
    return { url: session.url };
  });

// ---------------------------------------------------------------------------
// Phone verification + free promotion
// ---------------------------------------------------------------------------

export const sendAgentPhoneCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ phone: z.string().min(7).max(25) }).parse(i))
  .handler(async ({ data, context }) => {
    const { toE164 } = await import("./agent-discovery");
    const e164 = toE164(data.phone);
    if (!e164) throw new Error("Enter a valid mobile number.");
    const { sendSmsCode } = await import("./agent-discovery.server");
    try {
      const r = await sendSmsCode(context.userId, e164);
      if (!r.sent) {
        if (r.detail) console.error("agent verification send failed:", r.detail);
        return { sent: false, reason: r.reason, detail: r.detail };
      }
    } catch (e) {
      if ((e as Error).message === "SMS_NOT_CONFIGURED") return { sent: false, reason: "not_configured" as const };
      throw e;
    }
    return { sent: true, reason: null };
  });

export const confirmAgentPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        portfolioId: uuid,
        phone: z.string().min(7).max(25),
        code: z.string().regex(/^\d{4,10}$/),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: u } = await context.supabase.auth.getUser();
    if (!u?.user?.email_confirmed_at) throw new Error("Confirm your email address first.");
    const { toE164 } = await import("./agent-discovery");
    const e164 = toE164(data.phone);
    if (!e164) throw new Error("Enter a valid mobile number.");
    const { requireAgentBook, checkSmsCode, recordVerifiedPhone } = await import("./agent-discovery.server");
    const { orgId } = await requireAgentBook(context.supabase, context.userId, data.portfolioId);
    const check = await checkSmsCode(context.userId, e164, data.code);
    if (!check.ok) throw new Error(check.message);
    // License fields are not collected here; stored values are preserved.
    await recordVerifiedPhone({ userId: context.userId, orgId, e164, licenseKey: null, licenseNumber: null, licenseState: null });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logNetworkEvent } = await import("./network-events.server");
    await logNetworkEvent(supabaseAdmin, {
      action: "agent_phone_verified",
      actorUserId: context.userId,
      orgId,
      entityType: "agent_organization",
      entityId: orgId,
      metadata: {},
    });
    return { verified: true };
  });

/** Claim the free allowance using the already-verified phone. No new code needed. */
export const claimAgentFree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ portfolioId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: u } = await context.supabase.auth.getUser();
    if (!u?.user?.email_confirmed_at) throw new Error("Confirm your email address first.");
    const { requireAgentBook, redeemForVerifiedUser } = await import("./agent-discovery.server");
    const { orgId } = await requireAgentBook(context.supabase, context.userId, data.portfolioId);
    // Designated QA accounts (server-set app_metadata) never redeem.
    const verifyOnly = (u.user.app_metadata as any)?.sucasa_verify_only === true;
    const outcome = await redeemForVerifiedUser({ userId: context.userId, orgId, skipRedeem: verifyOnly });
    if (outcome !== "not_verified") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { logNetworkEvent } = await import("./network-events.server");
      await logNetworkEvent(supabaseAdmin, {
        action: outcome === "granted" ? "agent_promo_redeemed" : outcome === "already_entitled" || outcome === "verified_only" ? "agent_phone_verified" : "agent_promo_denied",
        actorUserId: context.userId,
        orgId,
        entityType: "agent_organization",
        entityId: orgId,
        metadata: { outcome },
      });
    }
    return { outcome };
  });

// ---------------------------------------------------------------------------
// Downgrade: keep chosen profiles, archive the rest (nothing deleted)
// ---------------------------------------------------------------------------

export const keepAgentProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ portfolioId: uuid, keepIds: z.array(uuid).max(20000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { requireAgentBook } = await import("./agent-discovery.server");
    const { orgId } = await requireAgentBook(context.supabase, context.userId, data.portfolioId);
    const { data: manager } = await context.supabase.rpc("is_lender_manager", { _user_id: context.userId, _org_id: orgId });
    if (!manager) throw new Error("Only the account owner can choose which profiles stay active.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: ledger } = await db.from("agent_credit_ledger").select("kind, delta").eq("org_id", orgId);
    const capacity = (ledger ?? [])
      .filter((r: any) => r.kind !== "spend" && r.kind !== "refund")
      .reduce((s: number, r: any) => s + r.delta, 0);
    const { data: activeRows } = await db
      .from("lender_portfolio_clients")
      .select("id, lender_portfolios!inner(lender_org_id)")
      .eq("lender_portfolios.lender_org_id", orgId)
      .is("archived_at", null);
    const activeIds = (activeRows ?? []).map((r: any) => r.id as string);
    const { selectArchive } = await import("./agent-discovery");
    const toArchive = selectArchive(activeIds, data.keepIds, capacity);
    const now = new Date().toISOString();
    for (let i = 0; i < toArchive.length; i += 200) {
      const chunk = toArchive.slice(i, i + 200);
      await db
        .from("lender_portfolio_clients")
        .update({ archived_at: now, archived_reason: "Plan capacity — chosen by agent" })
        .in("id", chunk)
        .is("archived_at", null);
      // An archived profile frees its slot; one refund per archive event.
      await db
        .from("agent_credit_ledger")
        .upsert(
          chunk.map((id) => ({
            org_id: orgId,
            kind: "refund",
            delta: 1,
            reason: "Profile archived",
            portfolio_client_id: id,
            event_key: `archive_refund:${id}:${now}`,
          })),
          { onConflict: "event_key", ignoreDuplicates: true },
        );
    }
    const { logNetworkEvent } = await import("./network-events.server");
    await logNetworkEvent(db, {
      action: "agent_downgrade_profiles_kept",
      actorUserId: context.userId,
      orgId,
      entityType: "agent_organization",
      entityId: orgId,
      metadata: { kept: activeIds.length - toArchive.length, archived: toArchive.length },
    });
    return { archived: toArchive.length, kept: activeIds.length - toArchive.length };
  });

export const listAgentActiveProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ portfolioId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { requireAgentBook } = await import("./agent-discovery.server");
    await requireAgentBook(context.supabase, context.userId, data.portfolioId);
    const { data: rows } = await context.supabase
      .from("lender_portfolio_clients")
      .select("id, client_name, address_line1, city")
      .eq("portfolio_id", data.portfolioId)
      .is("archived_at", null)
      .order("client_name");
    return (rows ?? []) as { id: string; client_name: string; address_line1: string; city: string | null }[];
  });

// ---------------------------------------------------------------------------
// Admin review queue
// ---------------------------------------------------------------------------

async function requireAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden: platform admins only");
}

export const listAgentIdentityReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data } = await context.supabase
      .from("agent_identity_reviews")
      .select("id, kind, user_id, org_id, related_user_id, signals, status, decision, decision_note, decided_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const decideAgentIdentityReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ reviewId: uuid, decision: z.enum(["approve_grant", "deny", "dismiss"]), note: z.string().trim().min(3).max(500) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: review } = await db.from("agent_identity_reviews").select("*").eq("id", data.reviewId).maybeSingle();
    if (!review || review.status !== "open") throw new Error("This review is already decided.");

    let grant: string | null = null;
    if (data.decision === "approve_grant") {
      if (!review.org_id) throw new Error("No organization to grant.");
      // Audited override: a distinct redemption identity tied to this review.
      const { data: outcome } = await db.rpc("redeem_agent_promotion", {
        _user_id: review.user_id,
        _org_id: review.org_id,
        _phone_hash: `override:${review.id}`,
      });
      grant = outcome as string;
    }
    await db
      .from("agent_identity_reviews")
      .update({
        status: data.decision === "approve_grant" ? "approved" : data.decision === "deny" ? "denied" : "dismissed",
        decision: grant ? `${data.decision}:${grant}` : data.decision,
        decision_note: data.note,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.reviewId);
    const { logNetworkEvent } = await import("./network-events.server");
    await logNetworkEvent(db, {
      action: "agent_identity_review_decided",
      actorUserId: context.userId,
      orgId: review.org_id,
      entityType: "agent_identity_review",
      entityId: review.id,
      metadata: { decision: data.decision, grant },
    });
    return { ok: true, grant };
  });
