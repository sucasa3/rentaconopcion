import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Audience = z.enum(["agent", "lender"]);

/** Ranked "who to contact today" queue for an agent or lender. */
export const getActionQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ audience: Audience, limit: z.number().min(1).max(100).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { buildActionQueue } = await import("./nba.server");
    return buildActionQueue(context.supabase, context.userId, data.audience, data.limit ?? 40);
  });

/** Write (or rewrite) the AI draft for one opportunity. */
export const draftOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ opportunityId: z.string().uuid(), audience: Audience }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { buildActionQueue, generateDraft, saveAction } = await import("./nba.server");
    const { recipeFor } = await import("./next-best-action");
    const { logAiUsage, monthlyUsageCount, COPILOT_MONTHLY_QUERY_CAP } = await import(
      "./ai-usage.server"
    );
    const { MODEL_LIGHT } = await import("./documents-ai.server");

    const queue = await buildActionQueue(context.supabase, context.userId, data.audience, 200);
    const item = queue.items.find((i) => i.opportunityId === data.opportunityId);
    if (!item) throw new Error("That opportunity is no longer in your queue.");

    const used = await monthlyUsageCount(context.userId, "nba_draft");
    if (used >= COPILOT_MONTHLY_QUERY_CAP) {
      throw new Error(
        `You've used all ${COPILOT_MONTHLY_QUERY_CAP} assistant drafts for this month. They reset on the 1st.`,
      );
    }

    const { data: profile } = await context.supabase
      .from("lender_member_profiles")
      .select("sender_name, contact_name")
      .eq("lender_org_id", item.orgId)
      .eq("user_id", context.userId)
      .maybeSingle();

    const draft = await generateDraft({
      audience: data.audience,
      channel: item.channel,
      clientName: item.name,
      category: item.category,
      reasons: item.reasons,
      senderName: profile?.contact_name ?? profile?.sender_name ?? null,
      address: item.address,
    });

    await logAiUsage({
      userId: context.userId,
      orgId: item.orgId,
      feature: "nba_draft",
      model: MODEL_LIGHT,
      usage: draft.usage,
      ok: true,
    });

    const recipe = recipeFor(item.category, data.audience);
    await saveAction({
      opportunityId: item.opportunityId,
      orgId: item.orgId,
      clientId: item.clientId,
      audience: data.audience,
      temperature: item.temperature,
      rank: item.rank,
      channel: item.channel,
      actionKey: recipe.key,
      headline: item.headline,
      why: item.why,
      subject: draft.subject,
      body: draft.body,
      model: MODEL_LIGHT,
    });

    return { subject: draft.subject, body: draft.body };
  });

/** Send the (possibly edited) draft to the homeowner, tracked. */
export const sendOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        opportunityId: z.string().uuid(),
        audience: Audience,
        subject: z.string().min(1).max(160),
        body: z.string().min(1).max(4000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { buildActionQueue } = await import("./nba.server");
    const { sendOutreachEmail } = await import("./outreach.server");

    const queue = await buildActionQueue(context.supabase, context.userId, data.audience, 200);
    const item = queue.items.find((i) => i.opportunityId === data.opportunityId);
    if (!item) throw new Error("That opportunity is no longer in your queue.");

    return sendOutreachEmail({
      orgId: item.orgId,
      clientId: item.clientId,
      opportunityId: item.opportunityId,
      actorUserId: context.userId,
      subject: data.subject,
      body: data.body,
    });
  });

/** One-tap outcome logging: talked, appointment, application, closed... */
export const logOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        opportunityId: z.string().uuid(),
        audience: Audience,
        stage: z.enum([
          "attempted",
          "talked",
          "appointment",
          "application",
          "listing",
          "closed",
          "not_interested",
        ]),
        note: z.string().max(500).optional(),
        valueCents: z.number().int().min(0).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { buildActionQueue } = await import("./nba.server");
    const { noteOutcomeInCrm } = await import("./outreach.server");
    const { outcomeLabel } = await import("./next-best-action");

    const queue = await buildActionQueue(context.supabase, context.userId, data.audience, 200);
    const item = queue.items.find((i) => i.opportunityId === data.opportunityId);
    if (!item) throw new Error("That opportunity is no longer in your queue.");

    const { error } = await context.supabase.from("opportunity_outcomes").insert({
      org_id: item.orgId,
      portfolio_client_id: item.clientId,
      opportunity_id: item.opportunityId,
      actor_user_id: context.userId,
      stage: data.stage,
      note: data.note ?? null,
      value_cents: data.valueCents ?? null,
    });
    if (error) throw new Error(error.message);

    if (data.stage === "closed" || data.stage === "not_interested") {
      await context.supabase
        .from("homeowner_opportunities")
        .update({ state: data.stage === "closed" ? "won" : "dismissed" })
        .eq("id", item.opportunityId);
    }

    await noteOutcomeInCrm(item.email, outcomeLabel(data.stage, data.audience));
    return { ok: true };
  });

/** Manager view: actions -> conversations -> appointments -> closings. */
export const getFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ audience: Audience, days: z.number().min(7).max(365).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { resolveScope } = await import("./nba.server");
    const scope = await resolveScope(context.supabase, context.userId, data.audience);
    if (!scope.orgIds.length) return null;
    const { data: rows, error } = await context.supabase.rpc("business_funnel", {
      _org_id: scope.orgIds[0],
      _days: data.days ?? 30,
    });
    if (error) throw new Error(error.message);
    return rows?.[0] ?? null;
  });
