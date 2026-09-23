/**
 * Post-call voice note — server functions (typed RPC).
 *
 * interpretPostCallNote: transcript → structured draft for the review screen.
 * savePostCallNote: review-confirmed values → ONE atomic transaction writing
 * both the outcome row (feeds existing Today/follow-up logic) and the
 * conversation record (rich, auditable history).
 *
 * Safety: these functions never send messages, never change consent, and
 * never write to homeowner, property, or contact records.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PostCallFinalSchema,
  PostCallInterpretationSchema,
  POST_CALL_SOURCES,
  editedFields,
  followUpDateToDueAt,
  normalizeFollowUpDate,
} from "./post-call";
import { TranscriptInput, gatherPostCallContext, interpretTranscript } from "./post-call.server";

const Audience = z.enum(["agent", "lender"]);

export const interpretPostCallNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        audience: Audience,
        clientId: z.string().uuid(),
        transcript: TranscriptInput,
        timezone: z.string().min(1).max(64),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    // Authorization: the client must be in the caller's own book.
    const ctx = await gatherPostCallContext(
      context.supabase,
      context.userId,
      data.audience,
      data.clientId,
    );

    const interpretation = await interpretTranscript({
      apiKey,
      context: ctx,
      transcript: data.transcript,
      timezone: data.timezone,
    });

    return {
      interpretation,
      // Echo the resolved org/opportunity so the save step can stay narrow.
      orgId: ctx.orgId,
      opportunityId: ctx.opportunityId,
    };
  });

export const savePostCallNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        audience: Audience,
        clientId: z.string().uuid(),
        opportunityId: z.string().uuid().nullable(),
        source: z.enum(POST_CALL_SOURCES),
        transcript: TranscriptInput,
        timezone: z.string().min(1).max(64),
        original: PostCallInterpretationSchema,
        final: PostCallFinalSchema,
        originalLanguage: z.enum(["en", "es", "mixed"]),
        scheduleFollowUp: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Re-verify authorization and org binding at save time; never trust the
    // client-supplied org.
    const ctx = await gatherPostCallContext(
      context.supabase,
      context.userId,
      data.audience,
      data.clientId,
    );
    const opportunityId = data.opportunityId ?? ctx.opportunityId;

    const wantsFollowUp = data.scheduleFollowUp && data.final.followUp.required;
    const followUpDate = wantsFollowUp
      ? normalizeFollowUpDate(data.final.followUp.date)
      : null;
    if (wantsFollowUp && !followUpDate) {
      // Exact date required by the existing Today architecture; the natural
      // timeframe text alone cannot drive the queue.
      throw new Error("Pick a follow-up date before scheduling.");
    }

    const edited = editedFields(data.original, data.final);
    const dueAt = followUpDate ? followUpDateToDueAt(followUpDate, data.timezone) : null;
    const nextStep = data.final.nextStep?.trim() || null;

    // ONE transaction: outcome + conversation. Both rows or neither.
    // (Generated RPC arg types are non-null strings; the function itself
    // accepts nulls, which the server-side validation above owns.)
    const rpcArgs = {
      p_org_id: ctx.orgId,
      p_client_id: data.clientId,
      p_opportunity_id: opportunityId,
      p_stage: data.final.outcome,
      p_note: data.final.summary,
      p_next_step: nextStep,
      p_next_step_due_at: dueAt,
      p_transcript: data.transcript,
      p_language: data.originalLanguage,
      p_summary: data.final.summary,
      p_key_facts: data.final.keyFacts,
      p_follow_up_date: followUpDate,
      p_timeframe_text: data.final.followUp.timeframeText,
      p_follow_up_reason: data.final.followUp.reason,
      p_suggested_opener: data.final.suggestedFutureOpener,
      p_edited_fields: edited,
      p_source: data.source,
    };
    const { data: conversationId, error } = await context.supabase.rpc(
      "record_post_call_save",
      rpcArgs as never,
    );
    if (error) throw new Error(error.message || "Could not save the note.");

    // CRM note mirroring, exactly like the one-tap outcome logger. Failure
    // here must never fail the save.
    const { noteOutcomeInCrm } = await import("./outreach.server");
    const { outcomeLabel } = await import("./next-best-action");
    noteOutcomeInCrm(ctx.clientEmail, outcomeLabel(data.final.outcome, data.audience)).catch(
      () => {},
    );

    return { ok: true, conversationId: conversationId as string };
  });
