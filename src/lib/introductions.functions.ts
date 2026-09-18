import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const channel = z.enum(["call", "text", "email"]);
const category = z.enum(["equity_access", "refinance_review", "move_related", "investment"]);

// --- Lender side -----------------------------------------------------------

/**
 * Aggregate, anonymous opportunity counts for a connected agent's book.
 * This is the ONLY opportunity read available to a lender.
 */
export const lenderAggregateOpportunities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ lenderOrgId: uuid, agentOrgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertMember } = await import("./network.server");
    const { aggregateOpportunitiesForLender } = await import("./introductions.server");
    await assertMember(context.supabase, context.userId, data.lenderOrgId);
    return aggregateOpportunitiesForLender(context.supabase, data.lenderOrgId, data.agentOrgId);
  });

/** The lender says it is available for a category. No homeowner is selected. */
export const requestCategoryIntroduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        lenderOrgId: uuid,
        agentOrgId: uuid,
        category,
        message: z.string().max(600).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { assertMember } = await import("./network.server");
    const { requestIntroductionForCategory } = await import("./introductions.server");
    await assertMember(context.supabase, context.userId, data.lenderOrgId);
    return requestIntroductionForCategory(
      context.supabase,
      data.lenderOrgId,
      data.agentOrgId,
      data.category,
      data.message ?? null,
      context.userId,
    );
  });

/** Lender-side list: status only, never a homeowner identifier. */
export const listLenderIntroductions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ lenderOrgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { listIntroductionsForLender } = await import("./introductions.server");
    return { rows: await listIntroductionsForLender(context.supabase, data.lenderOrgId) };
  });

/** Minimized consent confirmation, available only after homeowner acceptance. */
export const lenderAcceptedIntroduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ introductionId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { acceptedIntroductionForLender } = await import("./introductions.server");
    return acceptedIntroductionForLender(context.supabase, context.userId, data.introductionId);
  });

// --- Agent side ------------------------------------------------------------

export const listAgentIntroductions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ agentOrgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertMember } = await import("./network.server");
    const { listIntroductionsForAgent } = await import("./introductions.server");
    await assertMember(context.supabase, context.userId, data.agentOrgId);
    return { rows: await listIntroductionsForAgent(context.supabase, data.agentOrgId) };
  });

/** The agent's own matching clients. Agent-side only; never reachable by a lender. */
export const introductionCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ introductionId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { candidatesForIntroduction } = await import("./introductions.server");
    return { candidates: await candidatesForIntroduction(context.supabase, context.userId, data.introductionId) };
  });

/**
 * Offering an introduction asks the homeowner. It discloses nothing to the
 * lender, and it earns the agent nothing.
 */
export const agentRespondToIntroduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        introductionId: uuid,
        action: z.enum(["offer", "not_now", "decline"]),
        portfolioClientId: uuid.optional(),
        note: z.string().max(600).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { respondToIntroductionAsAgent } = await import("./introductions.server");
    return respondToIntroductionAsAgent(
      context.supabase,
      context.userId,
      data.introductionId,
      data.action,
      data.portfolioClientId ?? null,
      data.note ?? null,
    );
  });

// --- Homeowner side (public, token-mediated) -------------------------------

/** Server-mediated read of an emailed introduction link. No account required. */
export const readIntroductionLink = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ token: z.string().min(10).max(4000) }).parse(i))
  .handler(async ({ data }) => {
    const { readIntroductionInvite } = await import("./introductions.server");
    return readIntroductionInvite(data.token, { markViewed: true });
  });

/** The homeowner accepts (with channels) or declines. */
export const answerIntroductionLink = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        token: z.string().min(10).max(4000),
        decision: z.enum(["accepted", "declined"]),
        channels: z.array(channel).max(3).default([]),
        language: z.enum(["en", "es"]).default("en"),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { answerIntroduction } = await import("./introductions.server");
    let userAgent: string | null = null;
    let ip: string | null = null;
    try {
      userAgent = getRequestHeader("user-agent") ?? null;
      ip = getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? null;
    } catch {
      // Header access is best-effort evidence, never a gate.
    }
    return answerIntroduction(data.token, {
      decision: data.decision,
      channels: data.channels,
      language: data.language,
      ip,
      userAgent,
    });
  });

/** The homeowner withdraws one or more channels from this lender. */
export const withdrawIntroductionPermission = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        token: z.string().min(10).max(4000),
        channels: z.array(channel).max(3).default([]),
        scope: z.enum(["this_lender", "all_communication"]).default("this_lender"),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { readIntroductionInvite, revokeIntroductionChannels } = await import(
      "./introductions.server"
    );
    const view = await readIntroductionInvite(data.token);
    if (!view.ok) return { ok: false as const, reason: view.reason };
    const result = await revokeIntroductionChannels(view.introductionId, data.channels, {
      scope: data.scope,
    });
    return { ok: true as const, ...result };
  });
