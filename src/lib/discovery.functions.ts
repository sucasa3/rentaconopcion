/**
 * Free Lender Opportunity Discovery — callable server functions.
 *
 * Every read goes through the canonical lender access gate, so Discovery can
 * never show more than the paid product would. Uploading a past-client list
 * grants no access to any homeowner: the homeowner's own permissions remain
 * the only authority for anything homeowner-level.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DISCOVERY_ALLOWANCE,
  DISCOVERY_REVEAL_LIMIT,
  GROUP_BLURB,
  GROUP_LABEL,
  headline,
  supportingLine,
  summarize,
  type DiscoveryGroup,
} from "./discovery";

/** Create (or reuse) the lender's Discovery workspace. Never grants access. */
export const startDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ensureDiscoveryWorkspace } = await import("./discovery.server");
    const email = (context.claims as any)?.email ?? null;
    const ws = await ensureDiscoveryWorkspace(context.userId, { email });

    const { logNetworkEvent } = await import("./network-events.server");
    await logNetworkEvent({
      action: "lender_discovery_started",
      actorId: context.userId,
      orgId: ws.orgId,
      entityType: "lender_discovery",
      entityId: ws.discoveryId,
    }).catch(() => undefined);

    return ws;
  });

const UploadSchema = z.object({
  csv: z.string().min(10).max(2_000_000),
});

/** Upload a past-client export. The allowance is spent on properties, not rows. */
export const uploadDiscoveryCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UploadSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { ensureDiscoveryWorkspace, intakeDiscoveryCsv } = await import("./discovery.server");
    const email = (context.claims as any)?.email ?? null;
    const ws = await ensureDiscoveryWorkspace(context.userId, { email });

    const outcome = await intakeDiscoveryCsv({
      userId: context.userId,
      discoveryId: ws.discoveryId,
      portfolioId: ws.portfolioId,
      orgId: ws.orgId,
      email,
      csv: data.csv,
    });

    const { logNetworkEvent } = await import("./network-events.server");
    await logNetworkEvent({
      action: "lender_discovery_uploaded",
      actorId: context.userId,
      orgId: ws.orgId,
      entityType: "lender_discovery",
      entityId: ws.discoveryId,
      metadata: { accepted: outcome.accepted, excluded: outcome.excluded },
    }).catch(() => undefined);

    return { ...outcome, allowance: DISCOVERY_ALLOWANCE };
  });

/**
 * Move the Discovery forward one step: enrich a batch of properties from the
 * shared cache/providers, then finalize once the queue for this book is clear.
 * The UI polls this so the lender sees honest progress.
 */
export const advanceDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ensureDiscoveryWorkspace, finalizeDiscovery } = await import("./discovery.server");
    const ws = await ensureDiscoveryWorkspace(context.userId, {
      email: (context.claims as any)?.email ?? null,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runEnrichmentTick } = await import("./enrichment.server");

    const { data: clients } = await supabaseAdmin
      .from("lender_portfolio_clients")
      .select("id")
      .eq("portfolio_id", ws.portfolioId)
      .is("archived_at", null);
    const total = (clients ?? []).length;
    if (!total) return { status: "awaiting_upload" as const, done: 0, total: 0 };

    const tick = await runEnrichmentTick({ batchSize: 15 });

    const { count: pending } = await supabaseAdmin
      .from("property_enrichment_queue")
      .select("id", { count: "exact", head: true })
      .eq("portfolio_id", ws.portfolioId)
      .in("status", ["queued", "processing"]);

    const remaining = pending ?? 0;
    // Finish when the queue for this book is clear, or when the provider budget
    // pauses work — we never hold the lender in a spinner we cannot clear.
    if (remaining === 0 || tick.paused) {
      await finalizeDiscovery({
        discoveryId: ws.discoveryId,
        portfolioId: ws.portfolioId,
        orgId: ws.orgId,
      });
      return { status: "complete" as const, done: total, total, paused: tick.paused ?? null };
    }

    return {
      status: "processing" as const,
      done: Math.max(0, total - remaining),
      total,
      paused: null,
    };
  });

/**
 * The Discovery snapshot: the headline count, a mutually exclusive breakdown,
 * and the unlocked opportunities in full. Only opportunities that already meet
 * the canonical quality bar are unlocked — the bar is never lowered to fill
 * five slots.
 */
export const getDiscovery = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: memberships } = await context.supabase
      .from("lender_members")
      .select("lender_org_id")
      .eq("user_id", context.userId);
    const orgIds = (memberships ?? []).map((m: any) => m.lender_org_id);
    if (!orgIds.length) return null;

    const { data: run } = await supabaseAdmin
      .from("lender_discoveries")
      .select(
        "id, org_id, portfolio_id, status, allowance, submitted_rows, invalid_rows, duplicate_rows, over_allowance_rows, unique_properties, opportunity_clients, revealed_count, completed_at",
      )
      .in("org_id", orgIds)
      .maybeSingle();
    if (!run) return null;

    const { data: results } = await supabaseAdmin
      .from("lender_discovery_results")
      .select("portfolio_client_id, primary_category, primary_group, score, rank, revealed")
      .eq("discovery_id", (run as any).id)
      .order("rank", { ascending: true });

    const ranked = ((results ?? []) as any[]).map((r) => ({
      portfolioClientId: r.portfolio_client_id,
      opportunityId: null,
      primaryCategory: r.primary_category,
      primaryGroup: r.primary_group as DiscoveryGroup,
      score: r.score,
      strength: r.score >= 70 ? "strong" : r.score >= 45 ? "moderate" : "emerging",
      rank: r.rank,
      revealEligible: r.revealed,
    }));

    const summary = summarize((run as any).unique_properties ?? 0, ranked);

    // Unlocked detail, read through the canonical access gate.
    const revealedIds = new Set(
      ((results ?? []) as any[]).filter((r) => r.revealed).map((r) => r.portfolio_client_id),
    );
    let revealed: any[] = [];
    if (revealedIds.size) {
      const { readLenderWorkspace } = await import("./lender-workspace.server");
      const ws = await readLenderWorkspace(context.supabase, context.userId, {
        orgId: (run as any).org_id,
      });
      revealed = ((ws?.book ?? []) as any[])
        .filter((c) => revealedIds.has(c.id))
        .map((c) => {
          const row = ((results ?? []) as any[]).find((r) => r.portfolio_client_id === c.id);
          return {
            id: c.id,
            name: c.name,
            address: c.address,
            whyToday: c.whyToday,
            reasons: (c.reviews?.[0]?.why ?? []) as string[],
            objective: c.objective,
            opener: c.opener,
            channels: c.channels,
            channelReasons: c.channelReasons,
            estimatedValueCents: c.estimatedValueCents,
            estimatedEquityCents: c.estimatedEquityCents,
            estimatedLtvPct: c.estimatedLtvPct,
            loanAgeYears: c.loanAgeYears,
            dataGap: c.dataGap,
            primaryGroup: row?.primary_group ?? "other",
            rank: row?.rank ?? 99,
          };
        })
        .sort((a, b) => a.rank - b.rank);
    }

    return {
      discoveryId: (run as any).id,
      orgId: (run as any).org_id,
      status: (run as any).status as string,
      allowance: (run as any).allowance ?? DISCOVERY_ALLOWANCE,
      excluded: {
        invalid: (run as any).invalid_rows ?? 0,
        duplicate: (run as any).duplicate_rows ?? 0,
        overAllowance: (run as any).over_allowance_rows ?? 0,
        submitted: (run as any).submitted_rows ?? 0,
      },
      summary,
      headline: headline(summary),
      supporting: supportingLine(summary),
      groups: (Object.keys(GROUP_LABEL) as DiscoveryGroup[])
        .map((g) => ({
          key: g,
          label: GROUP_LABEL[g],
          blurb: GROUP_BLURB[g],
          count: summary.byGroup[g],
        }))
        .filter((g) => g.count > 0),
      revealed,
      revealLimit: DISCOVERY_REVEAL_LIMIT,
      completedAt: (run as any).completed_at ?? null,
    };
  });

const PilotSchema = z.object({ returnUrl: z.string().url() });

/**
 * The 90-day pilot: $447 charged now, then MLO Growth at $149/month once the
 * ninety days end. Both line items are in the same Stripe Checkout session so
 * the lender explicitly authorizes the future subscription, sees both amounts
 * before paying, and can cancel during the pilot.
 */
export const startPilotCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PilotSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: memberships } = await context.supabase
      .from("lender_members")
      .select("lender_org_id, role")
      .eq("user_id", context.userId);
    const owner = (memberships ?? []).find((m: any) => m.role === "owner");
    if (!owner) throw new Error("Forbidden: only an owner can start the pilot");
    const orgId = (owner as any).lender_org_id as string;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureCustomer, stripeRequest, priceIdColumn } = await import("./billing.server");

    const { data: org } = await supabaseAdmin
      .from("lender_orgs")
      .select("id, name, primary_contact_email, stripe_customer_id")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) throw new Error("Organization not found");

    const col = priceIdColumn();
    const { data: plans } = await supabaseAdmin
      .from("plan_tiers")
      .select("key, stripe_price_id, stripe_test_price_id")
      .in("key", ["pilot_90", "mlo_growth"]);
    const pilotPrice = (plans ?? []).find((p: any) => p.key === "pilot_90")?.[col] ?? null;
    const growthPrice = (plans ?? []).find((p: any) => p.key === "mlo_growth")?.[col] ?? null;
    if (!pilotPrice || !growthPrice) {
      throw new Error("Pilot pricing is not configured yet.");
    }

    const session = await stripeRequest<{ id: string; url: string }>("/checkout/sessions", "POST", {
      mode: "subscription",
      customer: await ensureCustomer(supabaseAdmin, org as any),
      client_reference_id: orgId,
      success_url: `${data.returnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${data.returnUrl}?checkout=cancelled`,
      line_items: [
        // Charged today.
        { price: pilotPrice, quantity: 1 },
        // Starts after the 90 free days; cancellable any time before then.
        { price: growthPrice, quantity: 1 },
      ],
      allow_promotion_codes: true,
      payment_method_collection: "always",
      subscription_data: {
        trial_period_days: 90,
        metadata: { sucasa_org_id: orgId, plan_key: "pilot_90" },
      },
      custom_text: {
        submit: {
          message:
            "You are paying $447 today for the 90-day pilot. On day 91 your plan continues as MLO Growth at $149/month unless you cancel before then. Cancel any time from your billing settings.",
        },
      },
      metadata: { sucasa_org_id: orgId, plan_key: "pilot_90" },
    });

    const { logNetworkEvent } = await import("./network-events.server");
    await logNetworkEvent({
      action: "lender_pilot_checkout_started",
      actorId: context.userId,
      orgId,
      entityType: "lender_org",
      entityId: orgId,
    }).catch(() => undefined);

    return { url: session.url };
  });
