import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  checkLenderLanguage,
  COMPLIANCE_NOTES,
  LENDER_LANGUAGE_RULES,
} from "@/lib/lender-access";

/** Today, Asked to Connect, the contact queue and My Book — all gated. */
export const getLenderWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { readLenderWorkspace } = await import("./lender-workspace.server");
    return readLenderWorkspace(context.supabase, context.userId, { orgId: data.orgId ?? null });
  });

/** One homeowner's lender-side detail view, or an explanation when blocked. */
export const getLenderHomeowner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { readLenderHomeowner } = await import("./lender-workspace.server");
    const person = await readLenderHomeowner(context.supabase, context.userId, data.clientId);
    if (!person)
      return {
        ok: false as const,
        reason:
          "This homeowner isn't in your own book, so their individual details can't be shown here.",
        person: null,
      };
    return { ok: true as const, reason: null, person };
  });


/** Record channel permissions and suppression flags for a homeowner record. */
export const setOutreachPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        email_allowed: z.boolean().optional(),
        sms_allowed: z.boolean().optional(),
        phone_allowed: z.boolean().optional(),
        automated_contact_allowed: z.boolean().optional(),
        do_not_call: z.boolean().optional(),
        do_not_text: z.boolean().optional(),
        do_not_email: z.boolean().optional(),
        consent_source: z.string().max(120).optional(),
        consent_basis: z.string().max(120).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { readLenderHomeowner } = await import("./lender-workspace.server");
    const person = await readLenderHomeowner(context.supabase, context.userId, data.clientId);
    if (!person) throw new Error("Not permitted");

    const { clientId, ...fields } = data;
    const { error } = await context.supabase.from("outreach_channel_permissions").upsert(
      {
        portfolio_client_id: clientId,
        homeowner_id: person.homeownerId,
        ...fields,
        consent_at: new Date().toISOString(),
      },
      { onConflict: "portfolio_client_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const BRIEF_SECTIONS = `Return markdown with exactly these sections:
## Why now
## Data-backed signals
## Conversation opportunities
## Questions to ask
## Suggested outreach
(include a short call opener, a text opener and an email version)
## Next best action`;

/**
 * Homeowner Review Brief — the lender sibling of the agent's listing brief.
 *
 * Generation is instructed with the compliance rules, then the completed output
 * is validated. Prohibited or unsupported claims cause a regeneration, never a
 * word-strip, because deleting a word can leave a misleading sentence behind.
 * Repeated failures are logged for compliance review.
 */
export const generateHomeownerReviewBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { readLenderHomeowner } = await import("./lender-workspace.server");
    const person = await readLenderHomeowner(context.supabase, context.userId, data.clientId);
    if (!person) throw new Error("Not permitted");

    const money = (c: number | null) => (c == null ? null : Math.round(c / 100));
    const facts = {
      homeowner: person.name,
      property: person.address,
      estimated_value_usd: money(person.estimatedValueCents),
      estimated_mortgage_balance_usd: money(person.estimatedBalanceCents),
      estimated_equity_usd: money(person.estimatedEquityCents),
      estimated_ltv_pct: person.estimatedLtvPct,
      loan_age_years: person.loanAgeYears,
      years_in_home: person.tenureYears,
      engagement_signal: person.engagementLine,
      asked_to_connect: person.askedToConnect,
      reviews: person.reviews.map((r) => ({
        type: r.type,
        label: r.label,
        reason_codes: r.reasonCodes,
        source_fields: r.sourceFields,
        why: r.why,
      })),
      contact_channels_permitted: person.channels,
    };

    const fallback = [
      "## Why now",
      person.reviews[0]?.why?.[0] ?? "A new signal was detected on this home.",
      "",
      "## Data-backed signals",
      ...person.reviews.flatMap((r) => r.why.map((w) => `- ${w}`)),
      "",
      "## Conversation opportunities",
      ...person.reviews.map((r) => `- ${r.label}: ${r.blurb}`),
      "",
      "## Questions to ask",
      "- Have your plans for the home changed?",
      "- Are there larger projects you're considering?",
      "- Would it be helpful to review your current mortgage and estimated equity?",
      "",
      "## Next best action",
      `- ${person.reviews[0]?.action ?? "Send a home and equity update"}`,
    ].join("\n");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { brief: fallback, ai: false, complianceNotes: COMPLIANCE_NOTES, attempts: 0 };

    const violationsLog: string[] = [];
    let brief = "";
    let ai = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const retryNote =
        attempt === 1
          ? ""
          : `\n\nYour previous draft was rejected for these compliance problems: ${violationsLog.join(
              "; ",
            )}. Rewrite the whole brief so none of them appear, and do not simply delete the words — rewrite the claim.`;

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `You help a mortgage professional prepare a helpful, non-salesy relationship check-in with an existing homeowner relationship. ${LENDER_LANGUAGE_RULES}`,
            },
            {
              role: "user",
              content: `Write a Homeowner Review Brief using ONLY these facts.\n${BRIEF_SECTIONS}${retryNote}\n\nFACTS:\n${JSON.stringify(
                facts,
                null,
                2,
              )}`,
            },
          ],
        }),
      });
      if (!res.ok) break;
      const json: any = await res.json();
      const text: string = json?.choices?.[0]?.message?.content ?? "";
      const check = checkLenderLanguage(text);
      if (check.ok) {
        brief = text;
        ai = true;
        break;
      }
      violationsLog.push(...check.violations.map((v) => `${v.code} (${v.why})`));
      await context.supabase
        .from("compliance_language_violations")
        .insert({
          org_id: person.access.category ? null : null,
          user_id: context.userId,
          surface: "homeowner_review_brief",
          attempt,
          violations: check.violations.map((v) => v.code),
          excerpt: check.violations[0]?.excerpt ?? null,
          resolved: false,
        })
        .then(() => undefined, () => undefined);
    }

    return {
      brief: brief || fallback,
      ai,
      rejectedAttempts: violationsLog.length,
      complianceNotes: COMPLIANCE_NOTES,
    };
  });

/**
 * Periodic fair-lending audit: confirms the live ranking inputs stay inside the
 * permitted set and reports the distribution of priorities being produced.
 */
export const auditLenderPrioritization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { readLenderWorkspace } = await import("./lender-workspace.server");
    const ws = await readLenderWorkspace(context.supabase, context.userId, {
      orgId: data.orgId ?? null,
    });
    if (!ws) return null;

    const { auditRankingInputs } = await import("./lender-access");
    const fields = [...new Set(ws.book.flatMap((c) => c.reviews.flatMap((r) => r.sourceFields)))];
    const audit = auditRankingInputs(fields);

    return {
      isAdmin: Boolean(isAdmin),
      inputsUsed: fields,
      prohibitedInputsFound: audit.prohibited,
      unrecognisedInputs: audit.unrecognised,
      ok: audit.ok,
      distribution: ws.counts,
      reviewedHomeowners: ws.book.length,
      aggregateOnly: ws.aggregateOnly,
    };
  });

/**
 * Lender workflow outcome. Recorded for the lender's own pipeline only: it can
 * never create an agent reward, agent capacity, entitlement change or any
 * sponsorship benefit.
 */
export const logLenderOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        stage: z.enum([
          "no_answer",
          "talked",
          "appointment",
          "application",
          "in_process",
          "closed",
          "not_interested",
          "follow_up",
        ]),
        note: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { readLenderWorkspace } = await import("./lender-workspace.server");
    const ws = await readLenderWorkspace(context.supabase, context.userId);
    const person = ws?.book.find((c) => c.id === data.clientId);
    if (!ws || !person) throw new Error("Not permitted");

    const { error } = await context.supabase.from("opportunity_outcomes").insert({
      org_id: ws.org.id,
      portfolio_client_id: data.clientId,
      stage: data.stage,
      note: data.note ?? null,
      actor_user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
