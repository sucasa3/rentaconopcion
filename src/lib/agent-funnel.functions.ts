import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const publicAgentEventSchema = z.object({
  action: z.enum([
    "agent_landing_view",
    "agent_start_clicked",
    "agent_deck_viewed",
    "agent_pricing_clicked",
    "agent_signin_clicked",
    "agent_signup_started",
    "lender_landing_view",
    "lender_pilot_clicked",
    "lender_pilot_submitted",
    "lender_deck_viewed",
    "lender_pricing_clicked",
    "lender_signin_clicked",
    "lender_discovery_cta_clicked",
    "lender_discovery_signup_started",
  ]),
  visitId: z.string().uuid(),
  source: z.string().trim().max(80).optional(),
  campaign: z.string().trim().max(120).optional(),
  landingPath: z.string().trim().max(180).optional(),
  referrerHost: z.string().trim().max(160).optional(),
});

const authenticatedAgentEventSchema = z.object({
  action: z.enum([
    "agent_signup_completed",
    "lender_discovery_signup_completed",
    "lender_discovery_processing_viewed",
    "lender_discovery_completed",
    "lender_discovery_revealed",
    "lender_discovery_opportunity_opened",
    "lender_discovery_empty_result",
    "lender_pilot_offer_viewed",
    "lender_discovery_export_requested",
  ]),
  visitId: z.string().uuid().optional(),
  source: z.string().trim().max(80).optional(),
  campaign: z.string().trim().max(120).optional(),
  landingPath: z.string().trim().max(180).optional(),
  referrerHost: z.string().trim().max(160).optional(),
});

function metadata(data: {
  visitId?: string;
  source?: string;
  campaign?: string;
  landingPath?: string;
  referrerHost?: string;
}) {
  return {
    visit_id: data.visitId ?? null,
    source: data.source ?? null,
    campaign: data.campaign ?? null,
    landing_path: data.landingPath ?? null,
    referrer_host: data.referrerHost ?? null,
  };
}

export const recordPublicAgentEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => publicAgentEventSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { logNetworkEventOnce } = await import("./network-events.server");
      await logNetworkEventOnce(supabaseAdmin, {
        action: data.action,
        entityType: "agent_funnel_visit",
        entityId: data.visitId,
        metadata: metadata(data),
      });
    } catch {
      // Analytics must never interrupt a public conversion action.
    }
    return { ok: true };
  });

export const recordAuthenticatedAgentEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => authenticatedAgentEventSchema.parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { logNetworkEventOnce } = await import("./network-events.server");
      await logNetworkEventOnce(supabaseAdmin, {
        action: data.action,
        actorUserId: context.userId,
        entityType: "agent_account",
        entityId: context.userId,
        metadata: metadata(data),
      });
    } catch {
      // Analytics must never interrupt authentication or activation.
    }
    return { ok: true };
  });
